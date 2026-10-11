// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package settings

import (
	"context"

	"billionmail-core/api/settings/v1"
)

type ISettingsV1 interface {
	GetVersion(ctx context.Context, req *v1.GetVersionReq) (res *v1.GetVersionRes, err error)
	GetSystemConfig(ctx context.Context, req *v1.GetSystemConfigReq) (res *v1.GetSystemConfigRes, err error)
	SetSystemConfig(ctx context.Context, req *v1.SetSystemConfigReq) (res *v1.SetSystemConfigRes, err error)
	SetSystemConfigKey(ctx context.Context, req *v1.SetSystemConfigKeyReq) (res *v1.SetSystemConfigKeyRes, err error)
	SetSSLConfig(ctx context.Context, req *v1.SetSSLConfigReq) (res *v1.SetSSLConfigRes, err error)
	GetTimeZoneList(ctx context.Context, req *v1.GetTimeZoneListReq) (res *v1.GetTimeZoneListRes, err error)
	SetIPWhitelist(ctx context.Context, req *v1.SetIPWhitelistReq) (res *v1.SetIPWhitelistRes, err error)
	DeleteIPWhitelist(ctx context.Context, req *v1.DeleteIPWhitelistReq) (res *v1.DeleteIPWhitelistRes, err error)
	AddIPWhitelist(ctx context.Context, req *v1.AddIPWhitelistReq) (res *v1.AddIPWhitelistRes, err error)
	SetReverseProxyDomain(ctx context.Context, req *v1.SetReverseProxyDomainReq) (res *v1.SetReverseProxyDomainRes, err error)
	DeleteReverseProxyDomain(ctx context.Context, req *v1.DeleteReverseProxyDomainReq) (res *v1.DeleteReverseProxyDomainRes, err error)
	RegenerateAPIToken(ctx context.Context, req *v1.RegenerateAPITokenReq) (res *v1.RegenerateAPITokenRes, err error)
	SetAPIDocSwagger(ctx context.Context, req *v1.SetAPIDocSwaggerReq) (res *v1.SetAPIDocSwaggerRes, err error)
	SetBlacklistAutoScan(ctx context.Context, req *v1.SetBlacklistAutoScanReq) (res *v1.SetBlacklistAutoScanRes, err error)
	SetBlacklistAlert(ctx context.Context, req *v1.SetBlacklistAlertReq) (res *v1.SetBlacklistAlertRes, err error)
	SetBlacklistAlertSettings(ctx context.Context, req *v1.SetBlacklistAlertSettingsReq) (res *v1.SetBlacklistAlertSettingsRes, err error)
}
