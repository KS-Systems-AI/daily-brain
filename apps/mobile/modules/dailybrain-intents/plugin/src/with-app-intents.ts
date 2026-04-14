import { type ConfigPlugin, withDangerousMod, withXcodeProject } from '@expo/config-plugins'
import * as fs from 'fs'
import * as path from 'path'

const SWIFT_FILES: string[] = [
  'Models/SharedDataStore.swift',
  'AppIntents/CreateTaskIntent.swift',
  'AppIntents/QuickCreateTaskIntent.swift',
  'AppIntents/DailyBrainShortcuts.swift',
]

const INTENTS_GROUP_NAME = 'DailyBrainIntents'

export const withAppIntents: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (dangerousConfig) => {
      const projectName = dangerousConfig.modRequest.projectName!
      const swiftSourceDir = path.join(__dirname, '..', 'swift')
      const targetDir = path.join(
        dangerousConfig.modRequest.projectRoot,
        'ios',
        projectName,
        INTENTS_GROUP_NAME,
      )

      fs.mkdirSync(targetDir, { recursive: true })

      for (const relativePath of SWIFT_FILES) {
        const source = path.join(swiftSourceDir, relativePath)
        const dest = path.join(targetDir, path.basename(relativePath))
        if (fs.existsSync(source)) {
          fs.copyFileSync(source, dest)
        }
      }

      return dangerousConfig
    },
  ])

  config = withXcodeProject(config, (xcodeConfig) => {
    const project = xcodeConfig.modResults
    const projectName = xcodeConfig.modRequest.projectName!

    const groupPath = path.join(projectName, INTENTS_GROUP_NAME)
    const intentGroupId = project.pbxCreateGroup(INTENTS_GROUP_NAME, groupPath)
    const mainGroup = project.getFirstProject().firstProject.mainGroup
    project.addToPbxGroup(intentGroupId, mainGroup)

    for (const relativePath of SWIFT_FILES) {
      const fileName = path.basename(relativePath)
      project.addSourceFile(
        fileName,
        { target: project.getFirstTarget().uuid },
        intentGroupId,
      )
    }

    return xcodeConfig
  })

  return config
}
