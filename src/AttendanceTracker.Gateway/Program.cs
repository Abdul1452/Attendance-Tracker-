using Yarp.ReverseProxy;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "attendance-gateway" }));
app.MapReverseProxy();
app.Run();
