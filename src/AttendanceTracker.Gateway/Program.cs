using Yarp.ReverseProxy;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using System.Xml.Linq;

var builder = WebApplication.CreateBuilder(args);
builder.Services.Configure<KeyManagementOptions>(options => options.XmlRepository = new MemoryXmlRepository());
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddReverseProxy().LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));
var app = builder.Build();
app.UseCors();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "attendance-gateway" }));
app.MapReverseProxy();
app.Run();

public sealed class MemoryXmlRepository : IXmlRepository
{
    private readonly System.Collections.Concurrent.ConcurrentBag<XElement> _elements = [];
    public IReadOnlyCollection<XElement> GetAllElements() => _elements.Select(element => new XElement(element)).ToArray();
    public void StoreElement(XElement element, string friendlyName) => _elements.Add(new XElement(element));
}
