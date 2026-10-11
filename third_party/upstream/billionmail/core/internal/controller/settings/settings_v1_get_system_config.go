package settings

import (
	"billionmail-core/api/settings/v1"
	"billionmail-core/internal/service/domains"
	"billionmail-core/internal/service/public"
	"context"
	"encoding/json"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gfile"
)

func (c *ControllerV1) GetSystemConfig(ctx context.Context, req *v1.GetSystemConfigReq) (res *v1.GetSystemConfigRes, err error) {
	res = &v1.GetSystemConfigRes{}

	envMap, err := public.LoadEnvFile()
	if err != nil {
		res.SetError(gerror.New(public.LangCtx(ctx, "Failed to read environment variable file: {}", err)))
		return res, nil
	}

	config := convertEnvToConfig(envMap)

	sslInfo, err := loadSSLInfo()
	if err == nil {
		config.SSL = *sslInfo
	}
	serverIP, err := public.GetServerIP()
	if err != nil {
		serverIP = "unknown"
	}
	config.ServerIP = serverIP

	whitelist, err := GetIPWhitelist()
	if err != nil {
		whitelist = []g.Map{}
	}
	config.IPWhitelist = whitelist

	var reverseProxyDomain string
	err = public.OptionsMgrInstance.GetOption(ctx, "reverse_proxy_domain", &reverseProxyDomain)
	if err != nil {
		reverseProxyDomain = ""
	}
	BaseURL := domains.GetBaseURL()
	config.ReverseProxyDomain.ReverseProxy = reverseProxyDomain
	config.ReverseProxyDomain.CurrentUrl = BaseURL

	// Load API configuration
	var apiDocEnabled bool
	var apiToken string

	err = public.OptionsMgrInstance.GetOption(ctx, "API_DOC_ENABLED", &apiDocEnabled)
	if err != nil {
		apiDocEnabled = false
	}

	err = public.OptionsMgrInstance.GetOption(ctx, "API_TOKEN", &apiToken)
	if err != nil {
		apiToken = ""
	}

	config.APIDocSwagger.APIDocEnabled = apiDocEnabled
	config.APIDocSwagger.APIToken = apiToken
	config.APIDocSwagger.APIDocURL = BaseURL + "/api.json"
	config.APIDocSwagger.SwaggerURL = BaseURL + "/swagger"

	// Load blacklist configuration
	blacklistConfig, err := loadBlacklistConfig(ctx)
	if err == nil {
		config.BlacklistConfig = *blacklistConfig
	} else {
		config.BlacklistConfig = v1.BlacklistConfig{
			AutoScanEnabled: true,
			AlertEnabled:    false,
			AlertSettings:   &v1.BlacklistAlertSettings{},
		}
	}

	res.Data = config

	res.SetSuccess(public.LangCtx(ctx, "Successfully retrieved system configuration"))
	return res, nil
}

func GetIPWhitelist() ([]g.Map, error) {
	result, err := g.DB().Model("bm_console_ip_whitelist").
		Fields("id, ip").
		All()

	if err != nil {
		return nil, gerror.Wrap(err, "Failed to get IP whitelist")
	}

	if result.IsEmpty() {
		return []g.Map{}, nil
	}

	var whitelist []g.Map
	for _, record := range result.List() {
		whitelist = append(whitelist, g.Map{
			"id": record["id"],
			"ip": record["ip"],
		})
	}

	return whitelist, nil
}

func loadBlacklistConfig(ctx context.Context) (*v1.BlacklistConfig, error) {
	config := &v1.BlacklistConfig{
		AutoScanEnabled: true,
		AlertEnabled:    false,
		AlertSettings:   &v1.BlacklistAlertSettings{},
	}

	var autoScanEnabled bool
	err := public.OptionsMgrInstance.GetOption(ctx, "blacklist_auto_scan_enabled", &autoScanEnabled)
	if err == nil {
		config.AutoScanEnabled = autoScanEnabled
	}

	var alertEnabled bool
	err = public.OptionsMgrInstance.GetOption(ctx, "blacklist_alert_enabled", &alertEnabled)
	if err == nil {
		config.AlertEnabled = alertEnabled
	}

	alertSettings, err := loadBlacklistAlertSettings()
	if err == nil && alertSettings != nil {
		config.AlertSettings = alertSettings
	}

	return config, nil
}

func loadBlacklistAlertSettings() (*v1.BlacklistAlertSettings, error) {
	alertSettingsFile := public.AbsPath("../core/data/blacklist_alert_settings.json")
	if !gfile.Exists(alertSettingsFile) {
		return nil, nil
	}

	content := gfile.GetContents(alertSettingsFile)
	if content == "" {
		return nil, nil
	}

	var settings v1.BlacklistAlertSettings
	err := json.Unmarshal([]byte(content), &settings)
	if err != nil {
		return nil, gerror.Wrap(err, "Failed to parse alert settings")
	}

	return &settings, nil
}
