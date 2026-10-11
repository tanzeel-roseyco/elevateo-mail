<template>
	<div class="inline-flex items-center gap-6px">
		<div class="inline-flex items-center gap-4px cursor-pointer" @click="onShowCheck">
			<i
				class="text-16px"
				:class="
					checkResult.blacklisted ? 'i-ooui:clear text-error' : 'i-ooui:success text-primary'
				">
			</i>
			<span class="leading-[1]">{{ time }}</span>
		</div>
		<!-- Check Now -->
		<n-popover>
			<template #trigger>
				<i class="i-common:search text-18px text-primary cursor-pointer" @click="onCheck"></i>
			</template>
			<span>{{ $t('domain.notSpam.checkNow') }}</span>
		</n-popover>
		<!-- Logs -->
		<n-popover>
			<template #trigger>
				<i class="i-common:logs text-18px cursor-pointer" @click="onShowLogs"></i>
			</template>
			<span>{{ $t('domain.notSpam.logs') }}</span>
		</n-popover>
	</div>
</template>

<script lang="ts" setup>
import { useTimeAgo } from '@vueuse/core'
import { DomainBlackCheckResult } from '../interface'
import { checkDomainBlacklist } from '@/api/modules/domain'

const { record, checkResult } = defineProps({
	record: {
		type: String,
		default: '',
	},
	checkResult: {
		type: Object as PropType<DomainBlackCheckResult>,
		default: () => ({}),
	},
})

const emit = defineEmits<{
	showCheck: []
	showCheckLogs: []
}>()

const time = computed(() => {
	if (!checkResult.time) return '--'
	return useTimeAgo(checkResult.time * 1000)
})

const onShowCheck = () => {
	emit('showCheck')
}

const onCheck = async () => {
	await checkDomainBlacklist({ a_record: record })
}

const onShowLogs = () => {
	emit('showCheckLogs')
}
</script>

<style lang="scss" scoped></style>
