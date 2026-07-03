using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Helpers;
using BandKalender.Models;

namespace BandKalender.Endpoints;

public static class MemberEndpoints
{
    public static IEndpointRouteBuilder MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/members", async (AppDbContext db) =>
            await db.Members.OrderBy(m => m.Id).Select(m => new { m.Id, m.Name, m.Color, m.IsAdmin }).ToListAsync());

        app.MapPost("/api/members", async (AppDbContext db, MemberDto dto) =>
        {
            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            if (string.IsNullOrWhiteSpace(dto.Password)) return Results.BadRequest(new { error = "Passwort fehlt" });

            var member = new Member
            {
                Name = name,
                Color = string.IsNullOrWhiteSpace(dto.Color) ? "#f5a524" : dto.Color!.Trim(),
                PasswordHash = PasswordHelper.Hash(dto.Password)
            };
            db.Members.Add(member);
            await db.SaveChangesAsync();
            return Results.Ok(new { member.Id, member.Name, member.Color });
        });

        app.MapDelete("/api/members/{id:int}", async (HttpContext ctx, AppDbContext db, int id) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins können Mitglieder löschen." }, statusCode: StatusCodes.Status403Forbidden);

            var member = await db.Members.FindAsync(id);
            if (member is null) return Results.NotFound();
            db.Availability.RemoveRange(db.Availability.Where(e => e.MemberId == id));
            db.Sessions.RemoveRange(db.Sessions.Where(s => s.MemberId == id));
            db.SongRatings.RemoveRange(db.SongRatings.Where(r => r.MemberId == id));
            db.SetlistRatings.RemoveRange(db.SetlistRatings.Where(r => r.MemberId == id));
            db.Members.Remove(member);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        return app;
    }
}
