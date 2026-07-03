using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Endpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole(o => o.FormatterName = "simple");
builder.Logging.SetMinimumLevel(LogLevel.Information);

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=bandkalender.db"));

builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 500 * 1024 * 1024);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    DatabaseInitializer.Initialize(db, app.Environment.WebRootPath);
}

// Global exception logger — catches every unhandled error with full stack trace
app.Use(async (ctx, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logger = ctx.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex,
            "Unhandled exception: {Method} {Path}{Query} — User={User}",
            ctx.Request.Method,
            ctx.Request.Path,
            ctx.Request.QueryString,
            ctx.Items.TryGetValue("memberId", out var uid) ? uid : "anonymous");

        if (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = 500;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsJsonAsync(new
            {
                error = "internal_server_error",
                message = ex.Message
            });
        }
    }
});

app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (path.StartsWith("/api/") && path != "/api/login" && path != "/api/config" && path != "/api/setup"
        && !(ctx.Request.Method == "GET" && path.StartsWith("/api/events/") && path.EndsWith("/ics"))
        && !(ctx.Request.Method == "GET" && path.StartsWith("/api/setlists/concert/") && path.EndsWith("/ics")))
    {
        var token = ctx.Request.Headers["X-Session-Token"].ToString();
        if (string.IsNullOrEmpty(token))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await ctx.Response.WriteAsJsonAsync(new { error = "unauthorized" });
            return;
        }
        using var s = ctx.RequestServices.CreateScope();
        var db = s.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = await db.Sessions.FirstOrDefaultAsync(x => x.Token == token);
        if (session is null)
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await ctx.Response.WriteAsJsonAsync(new { error = "unauthorized" });
            return;
        }
        ctx.Items["memberId"] = session.MemberId;
    }
    await next();
});

app.Use(async (ctx, next) =>
{
    await next();
    if (ctx.Request.Path.StartsWithSegments("/api") && ctx.Response.StatusCode >= 400)
    {
        var logger = ctx.RequestServices.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(
            "HTTP {Status}: {Method} {Path}{Query} — User={User}",
            ctx.Response.StatusCode,
            ctx.Request.Method,
            ctx.Request.Path,
            ctx.Request.QueryString,
            ctx.Items.TryGetValue("memberId", out var uid) ? uid : "anonymous");
    }
});

app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var name = ctx.File.Name;
        var ext  = Path.GetExtension(name);
        if (ext == ".html" || name == "version.txt" || name == "sw.js")
        {
            ctx.Context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            ctx.Context.Response.Headers["Pragma"]        = "no-cache";
            ctx.Context.Response.Headers["Expires"]       = "0";
        }
        else if (ext is ".js" or ".css")
        {
            // Versioned via ?v=BUILD → safe to cache long-term
            ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
        }
    }
});

app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapMemberEndpoints();
app.MapAvailabilityEndpoints();
app.MapEventEndpoints();
app.MapPushEndpoints();
app.MapSongEndpoints();
app.MapSetlistEndpoints();
app.MapTodoEndpoints();
app.MapFinanceEndpoints();
app.MapPresenceEndpoints();

app.Run();
