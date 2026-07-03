using Microsoft.EntityFrameworkCore;
using WebPush;
using BandKalender.Data;
using BandKalender.Models;

namespace BandKalender.Services;

public static class PushService
{
    const string Subject = "mailto:liebl.christoph@web.de";

    public static void FireAndForget(
        IServiceScopeFactory scopeFactory,
        Func<AppDbContext, Task<List<PushSub>>> getSubs,
        string payloadJson)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var subs = await getSubs(db);
                if (!subs.Any()) return;
                var vapidPublic = db.Database.SqlQuery<string>($"SELECT Value FROM AppConfig WHERE Key = 'VapidPublic'").First();
                var vapidPrivate = db.Database.SqlQuery<string>($"SELECT Value FROM AppConfig WHERE Key = 'VapidPrivate'").First();
                var client = new WebPushClient();
                client.SetVapidDetails(Subject, vapidPublic, vapidPrivate);
                var toDelete = new List<int>();
                foreach (var s in subs)
                {
                    try { await client.SendNotificationAsync(new WebPush.PushSubscription(s.Endpoint, s.P256dh, s.Auth), payloadJson); }
                    catch (WebPushException ex) when ((int)ex.StatusCode == 410) { toDelete.Add(s.Id); }
                    catch { }
                }
                if (toDelete.Any())
                {
                    db.PushSubs.RemoveRange(db.PushSubs.Where(s => toDelete.Contains(s.Id)));
                    await db.SaveChangesAsync();
                }
            }
            catch { }
        });
    }
}
