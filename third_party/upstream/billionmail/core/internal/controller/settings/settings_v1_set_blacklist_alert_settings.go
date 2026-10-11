package settings

import (
	"billionmail-core/api/settings/v1"
	"billionmail-core/internal/service/mail_service"
	"billionmail-core/internal/service/public"
	"billionmail-core/internal/service/relay"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gogf/gf/v2/errors/gerror"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gfile"
)

func (c *ControllerV1) SetBlacklistAlertSettings(ctx context.Context, req *v1.SetBlacklistAlertSettingsReq) (res *v1.SetBlacklistAlertSettingsRes, err error) {
	res = &v1.SetBlacklistAlertSettingsRes{}

	if err := validateAlertSettings(req); err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Parameter validation failed: {}", err.Error())))
		return res, nil
	}

	//g.Log().Info(ctx, "Testing SMTP connection...")
	if err := testSMTPConnectionWithRelay(ctx, req); err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "SMTP connection test failed: {}", err.Error())))
		return res, nil
	}

	//g.Log().Info(ctx, "Sending test email...")
	if err := sendTestEmailWithMailService(ctx, req); err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Failed to send test email: {}", err.Error())))
		return res, nil
	}

	alertSettingsFile := public.AbsPath("../core/data/blacklist_alert_settings.json")

	data := g.Map{
		"name":           req.Name,
		"sender_email":   req.SenderEmail,
		"smtp_password":  req.SMTPPassword,
		"smtp_server":    req.SMTPServer,
		"smtp_port":      req.SMTPPort,
		"recipient_list": req.RecipientList,
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Failed to encode alert settings: {}", err.Error())))
		return res, nil
	}

	err = gfile.PutContents(alertSettingsFile, string(jsonData))
	if err != nil {
		res.SetError(gerror.Newf(public.LangCtx(ctx, "Failed to save alert settings: {}", err.Error())))
		return res, nil
	}

	res.SetSuccess(public.LangCtx(ctx, "Alert settings saved successfully and test email sent"))
	return res, nil
}

func validateAlertSettings(settings *v1.SetBlacklistAlertSettingsReq) error {
	if settings.SenderEmail == "" {
		return fmt.Errorf("sender email is required")
	}

	if !strings.Contains(settings.SenderEmail, "@") {
		return fmt.Errorf("invalid sender email format")
	}

	if settings.SMTPServer == "" {
		return fmt.Errorf("SMTP server is required")
	}

	if settings.SMTPPort < 1 || settings.SMTPPort > 65535 {
		return fmt.Errorf("SMTP port must be between 1 and 65535")
	}

	if settings.SMTPPassword == "" {
		return fmt.Errorf("SMTP password is required")
	}

	if len(settings.RecipientList) == 0 {
		return fmt.Errorf("at least one recipient is required")
	}

	for _, recipient := range settings.RecipientList {
		if !strings.Contains(recipient, "@") {
			return fmt.Errorf("invalid recipient email format: %s", recipient)
		}
	}

	return nil
}

func testSMTPConnectionWithRelay(ctx context.Context, settings *v1.SetBlacklistAlertSettingsReq) error {
	//g.Log().Infof(ctx, "Testing SMTP connection to %s:%d", settings.SMTPServer, settings.SMTPPort)

	result := relay.TestSmtpConnection(
		settings.SMTPServer,
		fmt.Sprintf("%d", settings.SMTPPort),
		settings.SenderEmail,
		settings.SMTPPassword,
	)

	if !result.Success {
		return fmt.Errorf("%s", result.Message)
	}

	//g.Log().Infof(ctx, "SMTP connection test successful: %s", result.Message)
	return nil
}

func sendTestEmailWithMailService(ctx context.Context, settings *v1.SetBlacklistAlertSettingsReq) error {
	//g.Log().Infof(ctx, "Sending test email to %v", settings.RecipientList)

	subject := "Blacklist Alert Test - BillionMail"
	body := buildTestEmailHTML(settings)

	sender := mail_service.NewEmailSender()
	sender.Host = settings.SMTPServer
	sender.Port = fmt.Sprintf("%d", settings.SMTPPort)
	sender.Email = settings.SenderEmail
	sender.UserName = settings.SenderEmail
	sender.Password = settings.SMTPPassword

	err := sender.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %v", err)
	}
	defer sender.Close()

	var failedRecipients []string
	for _, recipient := range settings.RecipientList {

		message := mail_service.NewMessage(subject, body)
		message.SetRealName(settings.Name)
		messageId := sender.GenerateMessageID()
		message.SetMessageID(messageId)

		err = sender.Send(message, []string{recipient})
		if err != nil {
			g.Log().Errorf(ctx, "Failed to send test email to %s: %v", recipient, err)
			failedRecipients = append(failedRecipients, recipient)
		} else {
			g.Log().Infof(ctx, "Test email sent successfully to %s", recipient)
		}
	}

	if len(failedRecipients) > 0 {
		return fmt.Errorf("failed to send test email to %d recipient(s): %v", len(failedRecipients), failedRecipients)
	}

	g.Log().Infof(ctx, "Test email sent successfully to all %d recipients", len(settings.RecipientList))
	return nil
}

func buildTestEmailHTML(settings *v1.SetBlacklistAlertSettingsReq) string {
	return fmt.Sprintf(`
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Alert Settings Configured Successfully</title>
		<style>
			p {
				margin: 0;
			}
			body {
				background: #f5f5f5;
				margin: 0;
				padding: 20px;
				font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			}
			.container {
				max-width: 500px;
				margin: 40px auto;
				background: white;
				border-radius: 12px;
				box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
				overflow: hidden;
			}
			.header {
				text-align: center;
				padding: 40px 30px 30px;
				background: linear-gradient(135deg, #e3fcf0, #b2e8d1);
			}
			.success-icon {
				width: 80px;
				height: 80px;
				background: linear-gradient(135deg, #10b981, #059669);
				border-radius: 50%%;
				display: flex;
				align-items: center;
				justify-content: center;
				margin: 0 auto;
				box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
			}
			.content {
				padding: 32px 40px;
				text-align: center;
			}
			.content h2 {
				margin-top: 0;
				margin-bottom: 32px;
				color: #1f2937;
				font-size: 24px;
				font-weight: 600;
			}
			.content p {
				margin-top: 12px;
				color: #6b7280;
				font-size: 14px;
				line-height: 1.5;
			}
			.config-details {
				background: #f8fafc;
				border-radius: 8px;
				padding: 20px;
				margin: 24px 0;
				text-align: left;
				border-left: 4px solid #e3fcf0;
			}
			.config-title {
				font-weight: 600;
				color: #374151;
				margin-bottom: 16px;
				font-size: 16px;
			}
			.config-item {
				display: flex;
				margin-bottom: 12px;
				padding-bottom: 12px;
				border-bottom: 1px solid #e5e7eb;
			}
			.config-item:last-child {
				margin-bottom: 0;
				padding-bottom: 0;
				border-bottom: none;
			}
			.config-label {
				flex: 0 0 140px;
				font-weight: 500;
				color: #6b7280;
				font-size: 14px;
			}
			.config-value {
				flex: 1;
				color: #1f2937;
				font-weight: 500;
				font-size: 14px;
			}
			.button {
				display: inline-block;
				background: #10b981;
				color: white;
				padding: 12px 24px;
				text-decoration: none;
				border-radius: 6px;
				font-size: 16px;
				font-weight: 500;
				transition: all 0.2s ease;
				margin-top: 16px;
				box-shadow: 0 2px 5px rgba(16, 185, 129, 0.2);
			}
			.button:hover {
				background: #059669;
				transform: translateY(-2px);
				box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
			}
			.footer {
				text-align: center;
				padding: 20px 30px 30px;
				color: #9ca3af;
				font-size: 12px;
				background: #f9fafb;
				border-top: 1px solid #f3f4f6;
			}
			.footer a {
				color: #9ca3af;
				text-decoration: underline;
			}
			.footer a:hover {
				color: #6b7280;
			}
			.test-info {
				background: #e3fcf0;
				border-radius: 6px;
				padding: 12px 16px;
				margin: 20px 0;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			.test-info .config-label {
				flex: none;
				font-weight: 600;
				color: #374151;
				margin-right: 8px;
			}
			.test-info .config-value {
				flex: none;
				font-weight: 600;
				color: #059669;
			}
		</style>
	</head>
	<body>
		<div class="container">
			<div class="header">
				<div class="success-icon">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="40px" height="40px">
						<path d="M0 0h24v24H0z" fill="none" />
						<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
					</svg>
				</div>
			</div>
			<div class="content">
				<h2>Your alert settings have been configured successfully!</h2>

				<div class="config-details">
					<div class="config-title">Configuration Details:</div>
					<div class="config-item">
						<div class="config-label">Configuration Name:</div>
						<div class="config-value"> %s</div>
					</div>
					<div class="config-item">
						<div class="config-label">Sender Email:</div>
						<div class="config-value"> %s</div>
					</div>
					<div class="config-item">
						<div class="config-label">SMTP Server:</div>
						<div class="config-value">%s:%d</div>
					</div>
					<div class="config-item">
						<div class="config-label">Recipients:</div>
						<div class="config-value"> %d email(s)</div>
					</div>
				</div>

				<p>When a domain is detected on a blacklist, you will receive an alert email similar to this one.</p>

				<div class="test-info">
					<div class="config-label">Test Time:</div>
					<div class="config-value"> %s</div>
				</div>
			</div>
			<div class="footer">
				<div>
					<span>Powered by </span>
					<a href="https://www.billionmail.com/" target="_blank">BillionMail</a>
				</div>
			</div>
		</div>
	</body>
</html>
`, settings.Name, settings.SenderEmail, settings.SMTPServer, settings.SMTPPort,
		len(settings.RecipientList), time.Now().Format("2006-01-02 15:04:05"))
}
