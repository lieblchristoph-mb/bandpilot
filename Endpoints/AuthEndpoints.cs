using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using BandKalender.Data;
using BandKalender.Helpers;
using BandKalender.Models;

namespace BandKalender.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/config", async (AppDbContext db) =>
            Results.Ok(new { setup = !await db.Members.AnyAsync() }));

        app.MapPost("/api/setup", async (AppDbContext db, MemberDto dto) =>
        {
            if (await db.Members.AnyAsync())
                return Results.Json(new { error = "Setup bereits abgeschlossen" }, statusCode: StatusCodes.Status403Forbidden);

            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            if (string.IsNullOrWhiteSpace(dto.Password)) return Results.BadRequest(new { error = "Passwort fehlt" });

            var member = new Member
            {
                Name = name,
                Color = string.IsNullOrWhiteSpace(dto.Color) ? "#f5a524" : dto.Color!.Trim(),
                PasswordHash = PasswordHelper.Hash(dto.Password),
                IsAdmin = true,
                LastLogin = DateTime.UtcNow.ToString("o")
            };
            db.Members.Add(member);
            await db.SaveChangesAsync();

            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            db.Sessions.Add(new Session { Token = token, MemberId = member.Id });
            await db.SaveChangesAsync();
            return Results.Ok(new { token, id = member.Id, name = member.Name, displayName = member.DisplayName, color = member.Color, isAdmin = member.IsAdmin });
        });

        app.MapPost("/api/login", async (AppDbContext db, LoginDto dto) =>
        {
            var member = await db.Members.FirstOrDefaultAsync(m => m.Name == (dto.Name ?? "").Trim());
            if (member is null || string.IsNullOrEmpty(member.PasswordHash) || !PasswordHelper.Verify(dto.Password ?? "", member.PasswordHash))
                return Results.Json(new { error = "Name oder Passwort falsch" }, statusCode: StatusCodes.Status401Unauthorized);

            member.LastLogin = DateTime.UtcNow.ToString("o");
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            db.Sessions.Add(new Session { Token = token, MemberId = member.Id });
            await db.SaveChangesAsync();
            return Results.Ok(new { token, id = member.Id, name = member.Name, displayName = member.DisplayName, color = member.Color, isAdmin = member.IsAdmin });
        });

        app.MapPost("/api/logout", async (HttpContext ctx, AppDbContext db) =>
        {
            var token = ctx.Request.Headers["X-Session-Token"].ToString();
            var session = await db.Sessions.FirstOrDefaultAsync(s => s.Token == token);
            if (session is not null) { db.Sessions.Remove(session); await db.SaveChangesAsync(); }
            return Results.Ok();
        });

        app.MapGet("/api/me", async (HttpContext ctx, AppDbContext db) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            var member = await db.Members.FindAsync(memberId);
            if (member is null) return Results.NotFound();
            return Results.Ok(new { id = member.Id, name = member.Name, displayName = member.DisplayName, color = member.Color, isAdmin = member.IsAdmin });
        });

        return app;
    }
}
