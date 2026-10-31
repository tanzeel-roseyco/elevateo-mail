namespace Elevateo.Client.Core.Auth;

// AIDEV-NOTE: RFC 6750 bearer syntax excludes whitespace/control characters before header construction.
internal static class TokenValidation
{
    internal static bool IsBearerToken(string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        var padding = false;
        foreach (var c in token)
        {
            if (c == '=') { padding = true; continue; }
            if (padding || !(char.IsAsciiLetterOrDigit(c) || c is '-' or '.' or '_' or '~' or '+' or '/'))
                return false;
        }
        return token[0] != '=';
    }
}
