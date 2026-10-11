<template>
	<modal :title="$t('settings.common.notifySettings.blacklist.alarmSettings.title')" :width="500">
		<bt-form class="pt-8px">
			<n-form-item :label="$t('settings.common.notifySettings.blacklist.alarmSettings.name')">
				<n-input v-model:value="form.name"></n-input>
			</n-form-item>
			<n-form-item
				:label="$t('settings.common.notifySettings.blacklist.alarmSettings.senderEmail')">
				<n-input v-model:value="form.sender_email"></n-input>
			</n-form-item>
			<n-form-item
				:label="$t('settings.common.notifySettings.blacklist.alarmSettings.smtpPassword')">
				<n-input v-model:value="form.smtp_password"></n-input>
			</n-form-item>
			<n-form-item :label="$t('settings.common.notifySettings.blacklist.alarmSettings.smtpServer')">
				<n-input v-model:value="form.smtp_server"></n-input>
			</n-form-item>
			<n-form-item :label="$t('settings.common.notifySettings.blacklist.alarmSettings.port')">
				<n-input-number
					v-model:value="form.smtp_port"
					class="w-full"
					:min="1"
					:max="65535"
					:show-button="false">
				</n-input-number>
			</n-form-item>
			<n-form-item
				:label="$t('settings.common.notifySettings.blacklist.alarmSettings.recipientEmail')">
				<n-input v-model:value="form.recipient_list" type="textarea" :rows="4"></n-input>
			</n-form-item>
		</bt-form>
	</modal>
</template>

<script lang="ts" setup>
import { useModal } from '@/hooks/modal/useModal'
import { setBlacklistAlertSettings } from '@/api/modules/settings/common'
import { getSettingsStore } from '../../store'

const { blacklistConfig, getCommonConfig } = getSettingsStore()

const form = reactive({
	name: '',
	sender_email: '',
	smtp_password: '',
	smtp_server: '',
	smtp_port: 465,
	recipient_list: '',
})

const [Modal] = useModal({
	onChangeState: val => {
		if (val) {
			form.name = blacklistConfig.value.alert_settings.name
			form.sender_email = blacklistConfig.value.alert_settings.sender_email
			form.smtp_password = blacklistConfig.value.alert_settings.smtp_password
			form.smtp_server = blacklistConfig.value.alert_settings.smtp_server
			form.smtp_port = blacklistConfig.value.alert_settings.smtp_port
			form.recipient_list = blacklistConfig.value.alert_settings.recipient_list.join('\n')
		}
	},
	onConfirm: async () => {
		await setBlacklistAlertSettings({
			name: form.name,
			sender_email: form.sender_email,
			smtp_password: form.smtp_password,
			smtp_server: form.smtp_server,
			smtp_port: form.smtp_port,
			recipient_list: form.recipient_list.split('\n'),
		})
		getCommonConfig()
	},
})
</script>

<style lang="scss" scoped></style>
