<template>
	<n-card :bordered="false">
		<template #header>
			<div class="flex items-center">
				<n-icon class="mr-2 text-primary" size="20">
					<i class="i-mdi:notification-settings-outline"></i>
				</n-icon>
				<span class="text-lg font-medium">{{ $t('settings.common.notifySettings.title') }}</span>
			</div>
		</template>

		<BlacklistSetting />
		<n-divider />
		<AutoCheckSettings />
	</n-card>
</template>

<script lang="ts" setup>
import BlacklistSetting from './BlacklistSetting.vue'
import AutoCheckSettings from './AutoCheckSettings.vue'
</script>

<style lang="scss" scoped></style>
