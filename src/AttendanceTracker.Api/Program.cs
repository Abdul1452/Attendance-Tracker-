using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AttendanceTracker.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Options;
using System.Xml.Linq;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<KeyManagementOptions>(options => options.XmlRepository = new MemoryXmlRepository());
builder.Services.AddSingleton<AttendanceStore>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddAuthentication("DemoBearer").AddScheme<AuthenticationSchemeOptions, DemoBearerHandler>("DemoBearer", _ => { });
builder.Services.AddAuthorization();
var app = builder.Build();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "attendance-api" }));
app.MapPost("/api/auth/login", ([FromBody] LoginRequest request) =>
{
    var account = DemoAccounts.Find(request.Email.Trim().ToLowerInvariant());
    if (account is null || request.Password != "Demo123!") return Results.Unauthorized();
    return Results.Ok(new { accessToken = DemoBearerHandler.Issue(account.Id, account.Name, account.Role), user = account });
});
app.MapGet("/api/dashboard", [Authorize(Roles = "Teacher")] (AttendanceStore store) =>
{
    var session = store.GetActiveSession();
    return Results.Ok(new
    {
        course = "Human Computer Interaction", courseCode = "UXD-204", room = "Studio 204", teacher = "Dr. Amara Okafor",
        totalStudents = store.Students.Count, averageAttendance = 94, classesThisWeek = 8,
        checkedIn = session?.Entries.Count ?? 0, activeSession = session is null ? null : ToSession(session),
        attendance = session is null ? Array.Empty<object>() : session.Entries.Select(entry => (object)new { entry.StudentId, entry.StudentName, entry.Initials, entry.Status, entry.RecordedAt }).ToArray(),
        students = store.Students.Select(student => new { student.Id, student.Name, student.Initials, student.Email, student.Course })
    });
}).RequireAuthorization();
app.MapGet("/api/sessions/active", (AttendanceStore store) =>
{
    var session = store.GetActiveSession();
    return session is null ? Results.NoContent() : Results.Ok(ToStudentSession(session));
});
app.MapPost("/api/sessions", [Authorize(Roles = "Teacher")] (AttendanceStore store) => Results.Ok(ToSession(store.StartSession()))).RequireAuthorization();
app.MapPost("/api/sessions/{id}/close", [Authorize(Roles = "Teacher")] (string id, AttendanceStore store) => store.CloseSession(id) ? Results.NoContent() : Results.NotFound()).RequireAuthorization();
app.MapPost("/api/sessions/{id}/refresh-code", [Authorize(Roles = "Teacher")] (string id, AttendanceStore store) =>
{
    try { return Results.Ok(ToSession(store.RefreshCode(id))); }
    catch (InvalidOperationException) { return Results.NotFound(); }
}).RequireAuthorization();
app.MapPost("/api/attendance/check-in", [Authorize(Roles = "Student")] ([FromBody] CheckInRequest request, ClaimsPrincipal user, AttendanceStore store) =>
{
    var result = store.CheckIn(request.SessionId, request.Code, user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    return result.Success ? Results.Ok(new { message = result.Message, entry = result.Entry }) : Results.BadRequest(new { message = result.Message });
}).RequireAuthorization();
app.MapGet("/api/sessions/{id}/attendance", [Authorize(Roles = "Teacher")] (string id, AttendanceStore store) => Results.Ok(store.GetEntries(id))).RequireAuthorization();
app.MapGet("/api/me/attendance", [Authorize(Roles = "Student")] (ClaimsPrincipal user, AttendanceStore store) =>
{
    var studentId = user.FindFirstValue(ClaimTypes.NameIdentifier);
    return Results.Ok(store.GetSessions().SelectMany(session => session.Entries.Where(entry => entry.StudentId == studentId).Select(entry => new { session.Course, session.Room, session.StartsAt, entry.Status, entry.RecordedAt })));
}).RequireAuthorization();
app.Run();

static object ToSession(AttendanceTracker.Domain.ClassSession session) => new { session.Id, session.Course, session.Room, session.Code, session.StartsAt, session.IsOpen, session.CodeExpiresAt, entries = session.Entries };
static object ToStudentSession(AttendanceTracker.Domain.ClassSession session) => new { session.Id, session.Course, session.Room, session.StartsAt, session.IsOpen, session.CodeExpiresAt };
public sealed record LoginRequest(string Email, string Password);
public sealed record CheckInRequest(string SessionId, string Code);

public sealed class DemoBearerHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private const string Secret = "attendance-tracker-local-demo-secret-v1";
    public DemoBearerHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, System.Text.Encodings.Web.UrlEncoder encoder) : base(options, logger, encoder) { }
    public static string Issue(string id, string name, string role)
    {
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new TokenData(id, name, role, DateTimeOffset.UtcNow.AddHours(8).ToUnixTimeSeconds()))));
        return payload + "." + Sign(payload);
    }
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var raw = Request.Headers.Authorization.ToString();
        if (!raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return Task.FromResult(AuthenticateResult.NoResult());
        var token = raw[7..].Split('.');
        if (token.Length != 2 || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token[1]), Encoding.UTF8.GetBytes(Sign(token[0])))) return Task.FromResult(AuthenticateResult.Fail("Invalid token."));
        try
        {
            var data = JsonSerializer.Deserialize<TokenData>(Encoding.UTF8.GetString(Convert.FromBase64String(token[0])));
            if (data is null || data.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return Task.FromResult(AuthenticateResult.Fail("Token expired."));
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, data.Id), new Claim(ClaimTypes.Name, data.Name), new Claim(ClaimTypes.Role, data.Role) };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
        catch { return Task.FromResult(AuthenticateResult.Fail("Invalid token.")); }
    }
    private static string Sign(string payload) => Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes(payload)));
    private sealed record TokenData(string Id, string Name, string Role, long ExpiresAt);
}

static class DemoAccounts
{
    private static readonly Dictionary<string, object> Lookup = new(StringComparer.OrdinalIgnoreCase)
    {
        ["teacher@attendance.local"] = new Account("teacher-001", "Dr. Amara Okafor", "Teacher", "teacher@attendance.local"),
        ["alex@student.attendance.local"] = new Account("s-001", "Alex Morgan", "Student", "alex@student.attendance.local"),
        ["jamie@student.attendance.local"] = new Account("s-002", "Jamie Chen", "Student", "jamie@student.attendance.local"),
        ["sam@student.attendance.local"] = new Account("s-003", "Sam Rivera", "Student", "sam@student.attendance.local")
    };
    public static Account? Find(string email) => Lookup.GetValueOrDefault(email) as Account;
    public sealed record Account(string Id, string Name, string Role, string Email);
}

public sealed class MemoryXmlRepository : IXmlRepository
{
    private readonly System.Collections.Concurrent.ConcurrentBag<XElement> _elements = [];
    public IReadOnlyCollection<XElement> GetAllElements() => _elements.Select(element => new XElement(element)).ToArray();
    public void StoreElement(XElement element, string friendlyName) => _elements.Add(new XElement(element));
}
