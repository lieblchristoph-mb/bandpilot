namespace BandKalender.Models;

public class AvailabilityEntry
{
    public int Id { get; set; }
    public int MemberId { get; set; }

    // Datum als ISO-String "yyyy-MM-dd" – robust über alle DB-Provider hinweg
    public string Date { get; set; } = "";

    // "available" | "maybe" | "unavailable"
    public string Status { get; set; } = "available";

    public string? Note { get; set; }
}
