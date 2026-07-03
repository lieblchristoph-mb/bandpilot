namespace BandKalender.Models;

public class BandEvent
{
    public int Id { get; set; }
    public string Date { get; set; } = "";
    public string? Note { get; set; }
    public string? Time { get; set; }
}
