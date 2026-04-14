import { type ConfigPlugin, createRunOncePlugin } from '@expo/config-plugins'
import { withAppGroupEntitlement } from './with-app-group-entitlement'
import { withAppIntents } from './with-app-intents'

const withDailybrainIntents: ConfigPlugin = (config) => {
  config = withAppGroupEntitlement(config)
  config = withAppIntents(config)
  return config
}

export default createRunOncePlugin(withDailybrainIntents, 'dailybrain-intents', '1.0.0')
