namespace BandKalender.Models;

public class PushSub
{
    public int Id { get; set; }
    public int MemberId { get; set; }
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
}
