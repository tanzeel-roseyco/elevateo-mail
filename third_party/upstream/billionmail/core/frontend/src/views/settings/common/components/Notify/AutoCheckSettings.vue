<template>
	<div>
		<div class="block text-sm font-medium mb-3 text-basic">
			{{ $t('settings.common.notifySettings.blacklist.autoCheck.title') }}
		</div>
		<div class="flex items-center">
			<n-switch :value="blacklistConfig.auto_scan_enabled" @update:value="onUpdateValue" />
		</div>
	</div>
</template>

<script lang="ts" setup>
import { confirm } from '@/utils'
import { setBlacklistAutoScan } from '@/api/modules/settings/common'
import { getSettingsStore } from '../../store'

const { t } = useI18n()

const { blacklistConfig } = getSettingsStore()

const onUpdateValue = (value: boolean) => {
	confirm({
		title: value
			? t('settings.common.notifySettings.blacklist.autoCheck.confirm.enableTitle')
			: t('settings.common.notifySettings.blacklist.autoCheck.confirm.disableTitle'),
		content: value
			? t('settings.common.notifySettings.blacklist.autoCheck.confirm.enableContent')
			: t('settings.common.notifySettings.blacklist.autoCheck.confirm.disableContent'),
		onConfirm: async () => {
			await setBlacklistAutoScan({ enabled: value })
			blacklistConfig.value.auto_scan_enabled = value
		},
	})
}
</script>

<style lang="scss" scoped></style>
