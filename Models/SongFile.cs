namespace BandKalender.Models;

public class SongFile
{
    public int Id { get; set; }
    public int SongId { get; set; }
    public string FileName { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public long FileSize { get; set; }
    public double? DurationSeconds { get; set; }
}
