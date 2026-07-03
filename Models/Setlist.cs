namespace BandKalender.Models;

public class Setlist
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? ConcertDate { get; set; }
    public string? Notes { get; set; }
}
