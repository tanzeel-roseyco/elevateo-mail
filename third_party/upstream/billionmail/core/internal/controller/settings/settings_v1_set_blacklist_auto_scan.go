package settings

import (
	"billionmail-core/internal/service/public"
	"context"

	"github.com/gogf/gf/v2/errors/gerror"

	"billionmail-core/api/settings/v1"
)

func (c *ControllerV1) SetBlacklistAutoScan(ctx context.Context, req *v1.SetBlacklistAutoScanReq) (res *v1.SetBlacklistAutoScanRes, err error) {
	res = &v1.SetBlacklistAutoScanRes{}

	err = public.OptionsMgrInstance.SetOption(ctx, "blacklist_auto_scan_enabled", req.Enabled)
	if err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Failed to set auto scan switch: %v", err)))
		return res, nil
	}

	res.SetSuccess(public.LangCtx(ctx, "Auto scan switch updated successfully"))
	return res, nil
}
