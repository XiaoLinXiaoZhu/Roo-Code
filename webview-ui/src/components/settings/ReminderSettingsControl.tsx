import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface ReminderSettingsControlProps {
	reminderEnabled?: boolean
	onChange: (field: "reminderEnabled", value: any) => void
}

export const ReminderSettingsControl: React.FC<ReminderSettingsControlProps> = ({
	reminderEnabled = true,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleChange = useCallback(
		(e: any) => {
			onChange("reminderEnabled", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={reminderEnabled} onChange={handleChange}>
					<span className="font-medium">{t("settings:advanced.reminder.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.reminder.description")}
				</div>
			</div>
		</div>
	)
}
