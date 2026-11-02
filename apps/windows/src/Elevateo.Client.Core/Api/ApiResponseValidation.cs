using System.Globalization;
using System.Text;

namespace Elevateo.Client.Core.Api;

// AIDEV-NOTE: .NET 8 required members enforce presence, not non-null; validate before publishing API success.
internal static class ApiResponseValidation
{
    public static bool IsValid(object value) => value switch
    {
        Session s => Context(s.ContextId, s.AuthorizationVersion) && Token(s.CsrfToken)
            && s.Actor is { } actor && Id(actor.Id) && OptionalText(actor.DisplayName, 256)
            && s.Organization is { } org && Id(org.Id) && Text(org.Name, 256),
        MailboxPage p => Context(p.ContextId, p.AuthorizationVersion) && Cursor(p.NextCursor)
            && Items(p.Items, 50, m => Id(m.Id) && Text(m.DisplayName, 256)
                && OptionalText(m.DisplayAddress, 256) && m.Capabilities is { Read: true }),
        ThreadPage p => Context(p.ContextId, p.AuthorizationVersion) && Cursor(p.NextCursor) && Id(p.MailboxId)
            && Items(p.Items, 50, t => Id(t.Id) && Id(t.MailboxId) && OptionalText(t.Subject, 256)
                && OptionalAddress(t.Sender) && Text(t.PreviewText, 256) && Timestamp(t.LastMessageAt)
                && t.MessageCount >= 0 && Folder(t.Folder) && Timestamp(t.SnoozedUntil)),
        ThreadDetailPage p => Context(p.ContextId, p.AuthorizationVersion) && Cursor(p.NextCursor)
            && p.Thread is { } t && Id(t.Id) && Id(t.MailboxId) && OptionalText(t.Subject, 998)
            && t.MessageCount >= 0 && Folder(t.Folder) && Timestamp(t.SnoozedUntil)
            && Items(p.Messages, 20, m => Id(m.Id) && OptionalAddress(m.Sender)
                && Items(m.To, 100, Address) && Timestamp(m.SentAt) && Text(m.BodyText, 16384)
                && m.AttachmentCount is >= 0 and <= 1000),
        DraftSaveResult d => Id(d.DraftId) && Id(d.OperationId) && d.Version >= 1 && d.State == "editable",
        _ => false,
    };

    private static bool Context(string? context, string? version) => Token(context) && Token(version);
    private static bool Token(string? value) => value is { Length: >= 16 and <= 256 }
        && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
    private static bool Id(string? value) => Guid.TryParseExact(value, "D", out _);
    // Contract maxLength counts Unicode code points rather than UTF-16 code units.
    private static bool Text(string? value, int max) => value is not null && value.EnumerateRunes().Count() <= max;
    private static bool OptionalText(string? value, int max) => value is null || Text(value, max);
    private static bool Cursor(string? value) => value is null || value.Length > 0 && Text(value, 2048);
    private static bool Folder(string? value) => value is "inbox" or "archive" or "spam" or "trash";
    private static bool Timestamp(string? value)
    {
        if (value is null) return true;
        // AIDEV-NOTE: reject permissive date parsing; UTC wire timestamps require date, T, time and Z.
        if (value.Length < 20 || !value.EndsWith('Z')
            || !DateTime.TryParseExact(value.AsSpan(0, 19), "yyyy-MM-dd'T'HH:mm:ss",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return false;
        if (value.Length == 20) return true;
        // RFC 3339 permits any positive number of fractional digits, beyond .NET's tick precision.
        return value.Length > 21 && value[19] == '.'
            && value.AsSpan(20, value.Length - 21).IndexOfAnyExceptInRange('0', '9') < 0;
    }
    private static bool Address(Address value) => OptionalText(value.DisplayName, 256)
        && OptionalText(value.AddressValue, 256);
    private static bool OptionalAddress(Address? value) => value is null || Address(value);
    private static bool Items<T>(IReadOnlyList<T>? values, int max, Func<T, bool> valid) where T : class =>
        values is not null && values.Count <= max && values.All(v => v is not null && valid(v));
}
