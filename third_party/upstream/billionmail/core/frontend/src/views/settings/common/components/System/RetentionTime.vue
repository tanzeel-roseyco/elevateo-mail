<template>
	<div>
		<n-form-item ref="formItemRef" :label="$t('settings.common.retention.title')" path="username">
			<div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<n-input :value="$t('settings.common.retention.currentDays', { days: retentionDays })" disabled />
					<p class="mt-1 text-xs text-desc">
						{{ $t('settings.common.retention.trashHint') }}
					</p>
				</div>
				<div>
					<n-input-group>
						<n-input-number v-model:value="form.day" class="flex-1" :min="1" :show-button="false" placeholder="">
						</n-input-number>
						<n-input-group-label>{{ $t('settings.common.retention.day') }}</n-input-group-label>
					</n-input-group>
				</div>
			</div>
		</n-form-item>
		<div class="mt-4px">
			<n-button type="primary" :disabled="!form.day" @click="handleSubmit">
				{{ $t('settings.common.confirm') }}
			</n-button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { setSystemConfigKey } from '@/api/modules/settings/common';
import { getSettingsStore } from '@/views/settings/common/store'

const { retentionDays } = getSettingsStore()

const form = reactive({
	day: null as number | null,
})

const handleSubmit = async () => {
	await setSystemConfigKey({ key: 'retention_days', value: `${form.day}` })
	retentionDays.value = form.day || 0
}
</script>