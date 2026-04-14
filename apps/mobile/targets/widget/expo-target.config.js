/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  deploymentTarget: '18.0',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.dailybrain.app'],
  },
}
