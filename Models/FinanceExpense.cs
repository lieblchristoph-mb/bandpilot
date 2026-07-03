namespace BandKalender.Models;

public class FinanceExpense
{
    public int Id { get; set; }
    public int EventId { get; set; }
    public int MemberId { get; set; }
    public decimal Amount { get; set; }
    public string Description { get; set; } = "";
    public string? ReceiptFileName { get; set; }
    public string? ReceiptOriginalName { get; set; }
    public string CreatedAt { get; set; } = "";
}
