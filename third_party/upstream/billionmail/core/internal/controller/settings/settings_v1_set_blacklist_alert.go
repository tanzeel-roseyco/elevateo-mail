package settings

import (
	"billionmail-core/internal/service/public"
	"context"

	"github.com/gogf/gf/v2/errors/gerror"

	"billionmail-core/api/settings/v1"
)

func (c *ControllerV1) SetBlacklistAlert(ctx context.Context, req *v1.SetBlacklistAlertReq) (res *v1.SetBlacklistAlertRes, err error) {
	res = &v1.SetBlacklistAlertRes{}

	err = public.OptionsMgrInstance.SetOption(ctx, "blacklist_alert_enabled", req.Enabled)
	if err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Failed to set alert switch: %v", err)))
		return res, nil
	}

	res.SetSuccess(public.LangCtx(ctx, "Alert switch updated successfully"))
	return res, nil
}
