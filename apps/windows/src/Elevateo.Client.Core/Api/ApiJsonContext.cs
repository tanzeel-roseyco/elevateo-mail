using System.Text.Json.Serialization;
using Elevateo.Client.Core.Auth;

namespace Elevateo.Client.Core.Api;

// AIDEV-NOTE: source-generated serializer: trimming-safe for self-contained win-x64 publish,
// `required` rejects absent fields; ApiResponseValidation checks explicit nulls and contract bounds.
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never)]
[JsonSerializable(typeof(Session))]
[JsonSerializable(typeof(MailboxPage))]
[JsonSerializable(typeof(ThreadPage))]
[JsonSerializable(typeof(ThreadDetailPage))]
[JsonSerializable(typeof(DraftSaveInput))]
[JsonSerializable(typeof(DraftSaveResult))]
[JsonSerializable(typeof(ErrorBody))]
[JsonSerializable(typeof(TokenResponse))]
[JsonSerializable(typeof(NativeSessionRequest))]
public sealed partial class ApiJsonContext : JsonSerializerContext
{
}
