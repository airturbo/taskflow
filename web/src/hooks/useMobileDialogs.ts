import { useState } from 'react'

type MobileConfirmDialog = {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

type MobilePromptDialog = {
  message: string
  defaultValue?: string
  onSubmit: (value: string | null) => void
}

export function useMobileDialogs(isPhoneViewport: boolean) {
  const [mobileConfirmDialog, setMobileConfirmDialog] = useState<MobileConfirmDialog | null>(null)
  const [mobilePromptDialog, setMobilePromptDialog] = useState<MobilePromptDialog | null>(null)
  const [mobilePromptValue, setMobilePromptValue] = useState('')

  const mobileConfirm = (message: string): Promise<boolean> => {
    if (!isPhoneViewport) return Promise.resolve(window.confirm(message))
    return new Promise<boolean>((resolve) => {
      setMobileConfirmDialog({
        message,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }

  const mobilePrompt = (message: string, defaultValue = ''): Promise<string | null> => {
    if (!isPhoneViewport) return Promise.resolve(window.prompt(message, defaultValue))
    return new Promise<string | null>((resolve) => {
      setMobilePromptValue(defaultValue)
      setMobilePromptDialog({
        message,
        defaultValue,
        onSubmit: (value) => resolve(value),
      })
    })
  }

  return {
    mobileConfirmDialog, setMobileConfirmDialog,
    mobilePromptDialog, setMobilePromptDialog,
    mobilePromptValue, setMobilePromptValue,
    mobileConfirm,
    mobilePrompt,
  }
}
