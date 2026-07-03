namespace BandKalender.Models;

public class Song
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Notes { get; set; }
    public string Category { get; set; } = "own"; // "own", "cover", "wip"
}
