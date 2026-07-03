namespace BandKalender.Models;

public class Member
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    // Hex-Farbe für die Anzeige im Kalender, z. B. "#34d399"
    public string Color { get; set; } = "#f5a524";
    public string? PasswordHash { get; set; }
    public bool IsAdmin { get; set; }
    public string? LastLogin { get; set; }
    public string? DisplayName { get; set; }
}
