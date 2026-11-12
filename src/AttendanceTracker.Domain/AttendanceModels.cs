namespace AttendanceTracker.Domain;

public sealed record Student(string Id, string Name, string Email, string Initials, string Course);
public sealed record AttendanceEntry(string StudentId, string StudentName, string Initials, string Status, DateTimeOffset RecordedAt);
public sealed class ClassSession(string id, string course, string room, string code, DateTimeOffset startsAt)
{
    public string Id { get; } = id;
    public string Course { get; } = course;
    public string Room { get; } = room;
    public string Code { get; set; } = code;
    public DateTimeOffset CodeExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddSeconds(60);
    public DateTimeOffset StartsAt { get; } = startsAt;
    public bool IsOpen { get; set; } = true;
    public List<AttendanceEntry> Entries { get; } = [];
}
