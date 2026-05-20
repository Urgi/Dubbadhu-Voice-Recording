import { forwardRef } from 'react'
import { Keyboard, TextInput, type TextInputProps } from 'react-native'

export type AdminTextInputProps = TextInputProps & {
  /**
   * When true, Return adds a new line (JSON, scripts, paste-many-lines, team notes).
   * When false (default), keyboard shows Done and dismisses on submit.
   */
  allowMultiline?: boolean
}

/**
 * Standard admin text field: Done key dismisses keyboard unless `allowMultiline` is set.
 */
export const AdminTextInput = forwardRef<TextInput, AdminTextInputProps>(function AdminTextInput(
  { allowMultiline = false, multiline, onSubmitEditing, returnKeyType, blurOnSubmit, ...rest },
  ref,
) {
  const multilineEnabled = allowMultiline || multiline === true
  const dismissOnSubmit = !allowMultiline

  return (
    <TextInput
      ref={ref}
      {...rest}
      multiline={multilineEnabled}
      returnKeyType={dismissOnSubmit ? (returnKeyType ?? 'done') : (returnKeyType ?? 'default')}
      blurOnSubmit={dismissOnSubmit ? (blurOnSubmit ?? true) : (blurOnSubmit ?? false)}
      onSubmitEditing={(e) => {
        onSubmitEditing?.(e)
        if (dismissOnSubmit) Keyboard.dismiss()
      }}
    />
  )
})
