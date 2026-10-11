<template>
	<modal :title="$t('domain.checkLogs.title')" :width="820" :footer="false">
		<div class="pt-8px">
			<n-button type="primary" @click="getLogs">
				{{ $t('common.actions.refresh') }}
			</n-button>
			<div class="mt-16px h-440px">
				<n-spin class="h-full" :show="loading">
					<bt-logs :code="code" :scroll-to-bottom="true"></bt-logs>
				</n-spin>
			</div>
		</div>
	</modal>
</template>

<script lang="ts" setup>
import { useModal } from '@/hooks/modal/useModal'
import { getCheckLogs } from '@/api/modules/domain'
import { MailDomain } from '../interface'
import { isString } from '@/utils'

const code = ref('')

const loading = ref(false)

const pathRef = ref('')

const getLogs = async () => {
	try {
		loading.value = true
		const res = await getCheckLogs({ path: pathRef.value })
		code.value = isString(res) ? res : ''
	} finally {
		loading.value = false
	}
}

const [Modal, modalApi] = useModal({
	onChangeState: isOpen => {
		if (isOpen) {
			const { row } = modalApi.getState<{ row: MailDomain }>()
			pathRef.value = row.black_check_log
			getLogs()
		} else {
			pathRef.value = ''
			code.value = ''
		}
	},
})
</script>

<style lang="scss" scoped></style>
