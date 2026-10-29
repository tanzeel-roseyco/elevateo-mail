using System.Security.Cryptography;
using System.Text;

namespace Elevateo.Client.Core.Auth;

/// <summary>RFC 7636 S256 code verifier/challenge pair plus the per-attempt state value.</summary>
public sealed class PkceMaterial
{
    public string Verifier { get; }
    public string Challenge { get; }
    public string State { get; }

    private PkceMaterial(string verifier, string challenge, string state)
    {
        Verifier = verifier;
        Challenge = challenge;
        State = state;
    }

    public static PkceMaterial Create()
    {
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(48)); // 64 chars, within RFC 43..128
        var challenge = ChallengeFor(verifier);
        var state = Base64Url(RandomNumberGenerator.GetBytes(24));
        return new PkceMaterial(verifier, challenge, state);
    }

    /// <summary>S256 challenge for a verifier (checked against apps/shared/auth-conformance-vectors.json).</summary>
    public static string ChallengeFor(string verifier) => Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
