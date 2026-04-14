import { type ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins'

const APP_GROUP_ID = 'group.com.dailybrain.app'

export const withAppGroupEntitlement: ConfigPlugin = (config) => {
  return withEntitlementsPlist(config, (modifiedConfig) => {
    const entitlements = modifiedConfig.modResults

    if (!entitlements['com.apple.security.application-groups']) {
      entitlements['com.apple.security.application-groups'] = []
    }

    const groups = entitlements['com.apple.security.application-groups'] as string[]
    if (!groups.includes(APP_GROUP_ID)) {
      groups.push(APP_GROUP_ID)
    }

    return modifiedConfig
  })
}
