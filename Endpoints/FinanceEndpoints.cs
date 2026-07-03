using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Models;

namespace BandKalender.Endpoints;

public static class FinanceEndpoints
{
    public static IEndpointRouteBuilder MapFinanceEndpoints(this IEndpointRouteBuilder app)
    {
        // --- Events ---

        app.MapGet("/api/finance/events", async (AppDbContext db) =>
        {
            var events = await db.FinanceEvents.OrderByDescending(e => e.Date ?? e.CreatedAt).ToListAsync();
            var expenses = await db.FinanceExpenses.ToListAsync();
            var incomes = await db.FinanceIncomes.ToListAsync();
            return Results.Ok(events.Select(e => new
            {
                e.Id, e.Name, e.Date, e.Description,
                totalExpenses = Math.Round((double)expenses.Where(x => x.EventId == e.Id).Sum(x => x.Amount), 2),
                totalIncome = Math.Round((double)incomes.Where(x => x.EventId == e.Id).Sum(x => x.Amount), 2),
                expenseCount = expenses.Count(x => x.EventId == e.Id)
            }));
        });

        app.MapPost("/api/finance/events", async (HttpContext ctx, AppDbContext db, FinanceEventDto dto) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins können Events anlegen." }, statusCode: StatusCodes.Status403Forbidden);

            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });

            var ev = new FinanceEvent { Name = name, Date = dto.Date?.Trim(), Description = dto.Description?.Trim(), CreatedAt = DateTime.UtcNow.ToString("o") };
            db.FinanceEvents.Add(ev);
            await db.SaveChangesAsync();
            return Results.Ok(ev);
        });

        app.MapDelete("/api/finance/events/{id:int}", async (HttpContext ctx, AppDbContext db, IWebHostEnvironment env, int id) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins." }, statusCode: StatusCodes.Status403Forbidden);

            var ev = await db.FinanceEvents.FindAsync(id);
            if (ev is null) return Results.NotFound();

            var expenses = await db.FinanceExpenses.Where(e => e.EventId == id).ToListAsync();
            foreach (var exp in expenses)
            {
                if (exp.ReceiptFileName is not null)
                {
                    var path = Path.Combine(env.WebRootPath, "uploads", "receipts", exp.ReceiptFileName);
                    if (File.Exists(path)) File.Delete(path);
                }
            }
            db.FinanceExpenses.RemoveRange(expenses);
            db.FinanceIncomes.RemoveRange(db.FinanceIncomes.Where(i => i.EventId == id));
            db.FinanceEvents.Remove(ev);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPatch("/api/finance/events/{id:int}/bandkasse", async (AppDbContext db, int id, BandkasseDto dto) =>
        {
            var ev = await db.FinanceEvents.FindAsync(id);
            if (ev is null) return Results.NotFound();
            ev.BandkasseAmount = dto.Amount < 0 ? 0 : dto.Amount;
            await db.SaveChangesAsync();
            return Results.Ok(new { ev.BandkasseAmount });
        });

        app.MapGet("/api/finance/events/{id:int}", async (AppDbContext db, int id) =>
        {
            var ev = await db.FinanceEvents.FindAsync(id);
            if (ev is null) return Results.NotFound();

            var expenses = await db.FinanceExpenses.Where(e => e.EventId == id).OrderBy(e => e.CreatedAt).ToListAsync();
            var incomes = await db.FinanceIncomes.Where(i => i.EventId == id).OrderBy(i => i.CreatedAt).ToListAsync();
            var members = await db.Members.ToListAsync();

            var totalExpenses = expenses.Sum(e => e.Amount);
            var totalIncome = incomes.Sum(i => i.Amount);
            var totalBandkasse = ev.BandkasseAmount;
            var net = totalIncome - totalExpenses;
            var distributable = net - totalBandkasse;
            var memberCount = members.Count;
            var perMemberSplit = memberCount > 0 ? distributable / memberCount : 0;

            var memberBalances = members.Select(m =>
            {
                var paid = expenses.Where(e => e.MemberId == m.Id).Sum(e => e.Amount);
                var receives = paid + perMemberSplit;
                return new { memberId = m.Id, name = m.Name, color = m.Color, paid = Math.Round((double)paid, 2), receives = Math.Round((double)receives, 2) };
            }).ToList();

            return Results.Ok(new
            {
                ev.Id, ev.Name, ev.Date, ev.Description, ev.BandkasseAmount,
                expenses = expenses.Select(e => new
                {
                    e.Id, e.MemberId, e.Amount, e.Description, e.CreatedAt,
                    receiptUrl = e.ReceiptFileName != null ? $"/uploads/receipts/{e.ReceiptFileName}" : null,
                    receiptName = e.ReceiptOriginalName,
                    memberName = members.FirstOrDefault(m => m.Id == e.MemberId)?.Name ?? "?",
                    memberColor = members.FirstOrDefault(m => m.Id == e.MemberId)?.Color
                }),
                incomes = incomes.Select(i => new { i.Id, i.Amount, i.Description, i.CreatedAt }),
                balance = new
                {
                    totalExpenses = Math.Round((double)totalExpenses, 2),
                    totalIncome = Math.Round((double)totalIncome, 2),
                    totalBandkasse = Math.Round((double)totalBandkasse, 2),
                    net = Math.Round((double)net, 2),
                    distributable = Math.Round((double)distributable, 2),
                    perMemberSplit = Math.Round((double)perMemberSplit, 2),
                    memberBalances
                }
            });
        });

        // --- Expenses ---

        app.MapPost("/api/finance/events/{id:int}/expenses", async (HttpContext ctx, AppDbContext db, IWebHostEnvironment env, int id) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var ev = await db.FinanceEvents.FindAsync(id);
            if (ev is null) return Results.NotFound();

            var form = await ctx.Request.ReadFormAsync();
            var amountStr = form["amount"].ToString();
            if (!decimal.TryParse(amountStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var amount) || amount <= 0)
                return Results.BadRequest(new { error = "Betrag ungültig" });

            var description = form["description"].ToString().Trim();
            var payerIdStr = form["memberId"].ToString();
            var payerId = int.TryParse(payerIdStr, out var pid) ? pid : callerId;

            // Nur Admin darf für andere eintragen
            var caller = await db.Members.FindAsync(callerId);
            if (payerId != callerId && (caller is null || !caller.IsAdmin))
                payerId = callerId;

            string? receiptFileName = null;
            string? receiptOriginalName = null;
            var file = form.Files.GetFile("receipt");
            if (file is not null && file.Length > 0)
            {
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!new[] { ".jpg", ".jpeg", ".png", ".pdf" }.Contains(ext))
                    return Results.BadRequest(new { error = "Nur Bilder (JPG, PNG) und PDFs als Beleg" });

                receiptFileName = $"{Guid.NewGuid()}{ext}";
                var uploadPath = Path.Combine(env.WebRootPath, "uploads", "receipts");
                Directory.CreateDirectory(uploadPath);
                await using var stream = File.Create(Path.Combine(uploadPath, receiptFileName));
                await file.CopyToAsync(stream);
                receiptOriginalName = file.FileName;
            }

            var expense = new FinanceExpense
            {
                EventId = id, MemberId = payerId, Amount = amount,
                Description = description, ReceiptFileName = receiptFileName,
                ReceiptOriginalName = receiptOriginalName,
                CreatedAt = DateTime.UtcNow.ToString("o")
            };
            db.FinanceExpenses.Add(expense);
            await db.SaveChangesAsync();
            return Results.Ok(expense);
        });

        app.MapPut("/api/finance/events/{id:int}/expenses/{expId:int}", async (HttpContext ctx, AppDbContext db, IWebHostEnvironment env, int id, int expId) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            var expense = await db.FinanceExpenses.FirstOrDefaultAsync(e => e.Id == expId && e.EventId == id);
            if (expense is null) return Results.NotFound();

            if (expense.MemberId != callerId && (caller is null || !caller.IsAdmin))
                return Results.Json(new { error = "Keine Berechtigung" }, statusCode: StatusCodes.Status403Forbidden);

            var form = await ctx.Request.ReadFormAsync();
            var amountStr = form["amount"].ToString();
            if (!decimal.TryParse(amountStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var amount) || amount <= 0)
                return Results.BadRequest(new { error = "Betrag ungültig" });

            expense.Description = form["description"].ToString().Trim();
            expense.Amount = amount;

            if (caller?.IsAdmin == true)
            {
                var payerIdStr = form["memberId"].ToString();
                if (int.TryParse(payerIdStr, out var pid)) expense.MemberId = pid;
            }

            var file = form.Files.GetFile("receipt");
            if (file is not null && file.Length > 0)
            {
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!new[] { ".jpg", ".jpeg", ".png", ".pdf" }.Contains(ext))
                    return Results.BadRequest(new { error = "Nur Bilder (JPG, PNG) und PDFs als Beleg" });

                if (expense.ReceiptFileName is not null)
                {
                    var oldPath = Path.Combine(env.WebRootPath, "uploads", "receipts", expense.ReceiptFileName);
                    if (File.Exists(oldPath)) File.Delete(oldPath);
                }
                var receiptFileName = $"{Guid.NewGuid()}{ext}";
                var uploadPath = Path.Combine(env.WebRootPath, "uploads", "receipts");
                Directory.CreateDirectory(uploadPath);
                await using var stream = File.Create(Path.Combine(uploadPath, receiptFileName));
                await file.CopyToAsync(stream);
                expense.ReceiptFileName = receiptFileName;
                expense.ReceiptOriginalName = file.FileName;
            }

            await db.SaveChangesAsync();
            return Results.Ok(expense);
        });

        app.MapDelete("/api/finance/events/{id:int}/expenses/{expId:int}", async (HttpContext ctx, AppDbContext db, IWebHostEnvironment env, int id, int expId) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            var expense = await db.FinanceExpenses.FirstOrDefaultAsync(e => e.Id == expId && e.EventId == id);
            if (expense is null) return Results.NotFound();

            // Nur eigene Ausgaben löschen, außer Admin
            if (expense.MemberId != callerId && (caller is null || !caller.IsAdmin))
                return Results.Json(new { error = "Keine Berechtigung" }, statusCode: StatusCodes.Status403Forbidden);

            if (expense.ReceiptFileName is not null)
            {
                var path = Path.Combine(env.WebRootPath, "uploads", "receipts", expense.ReceiptFileName);
                if (File.Exists(path)) File.Delete(path);
            }
            db.FinanceExpenses.Remove(expense);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        // --- Income ---

        app.MapPost("/api/finance/events/{id:int}/income", async (HttpContext ctx, AppDbContext db, int id, FinanceIncomeDto dto) =>
        {
            var ev = await db.FinanceEvents.FindAsync(id);
            if (ev is null) return Results.NotFound();
            if (dto.Amount <= 0) return Results.BadRequest(new { error = "Betrag ungültig" });

            var income = new FinanceIncome { EventId = id, Amount = dto.Amount, Description = dto.Description?.Trim() ?? "", CreatedAt = DateTime.UtcNow.ToString("o") };
            db.FinanceIncomes.Add(income);
            await db.SaveChangesAsync();
            return Results.Ok(income);
        });

        app.MapDelete("/api/finance/events/{id:int}/income/{incId:int}", async (HttpContext ctx, AppDbContext db, int id, int incId) =>
        {
            var income = await db.FinanceIncomes.FirstOrDefaultAsync(i => i.Id == incId && i.EventId == id);
            if (income is null) return Results.NotFound();
            db.FinanceIncomes.Remove(income);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        return app;
    }
}
