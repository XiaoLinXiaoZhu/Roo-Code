import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface IntentTreeSettingsControlProps {
	intentTreeEnabled?: boolean
	onChange: (field: "intentTreeEnabled", value: any) => void
}

export const IntentTreeSettingsControl: React.FC<IntentTreeSettingsControlProps> = ({
	intentTreeEnabled = false,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleChange = useCallback(
		(e: any) => {
			onChange("intentTreeEnabled", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={intentTreeEnabled} onChange={handleChange}>
					<span className="font-medium">{t("settings:advanced.intentTree.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.intentTree.description")}
				</div>
			</div>
		</div>
	)
}
