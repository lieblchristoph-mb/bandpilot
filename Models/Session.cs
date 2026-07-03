namespace BandKalender.Models;

public class Session
{
    public int Id { get; set; }
    public string Token { get; set; } = "";
    public int MemberId { get; set; }
}
