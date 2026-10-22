import { isAbsolute, join } from 'node:path'
import * as officeSkills from '@deepseek-ai/dsh-skill-office'
import * as workspaceDependencies from '@deepseek-ai/dsh-tool-workspace-dependencies'
import { createTemplateLibrary } from './lib/templates.js'
import { registerBusinessSkills } from './lib/business-skills.js'
import { registerOfficeContext, registerOfficeRoutes } from './lib/modes.js'
import { templateTool } from './lib/template-tool.js'
import { createDocxWorkflow, docxWriteTool, registerDocxDelivery } from './lib/docx-workflow.js'

export const name = 'desktop-office'
export const inject = ['skills']

/** Installation-owned resources; neither Profile paths nor cwd are anchors. */
export async function apply(ctx, config) {
  if (!config || typeof config.resources !== 'string' || !isAbsolute(config.resources)
    || typeof config.cli !== 'string' || !isAbsolute(config.cli)) {
    throw new Error('desktop-office: absolute resources and CLI paths are required')
  }
  // Validate the immutable payload at activation; tool calls still use upstream
  // validation and retry behavior. Safe Mode omits this optional composition.
  await workspaceDependencies.resolvePrimaryRuntime(join(config.resources, 'primary-runtime'))
  // The product keeps the PPT plugin unmounted. Reuse its state/audit facade,
  // without applying that plugin or registering its tools, routes or UI.
  if (config.modesRoot !== undefined) {
    if (typeof config.modesRoot !== 'string' || !isAbsolute(config.modesRoot)) {
      throw new Error('desktop-office: modesRoot must be an absolute path')
    }
    const { createOfficeModes } = await import('dsh-ppt')
    ctx.provide('officeModes', createOfficeModes(config.modesRoot))
  }
  await ctx.plugin(workspaceDependencies, { source: join(config.resources, 'primary-runtime') })
  await ctx.plugin(officeSkills, {
    assetRoot: join(config.resources, 'office-skills'),
    node: process.execPath,
    cli: config.cli
  })
  registerBusinessSkills(ctx, join(config.resources, 'business-skills'))
  const library = await createTemplateLibrary(join(config.resources, 'templates'))
  ctx.inject(['officeModes', 'tools', 'skills', 'workingDirectory', 'sandboxPolicy', 'sandbox', 'subprocess'], scoped => {
    registerOfficeContext(scoped, library, scoped.officeModes)
    const docx = createDocxWorkflow(scoped, library, scoped.officeModes, config.resources)
    scoped.tools.register(templateTool(scoped, library, scoped.officeModes, docx))
    scoped.tools.register(docxWriteTool(docx))
    registerDocxDelivery(scoped, library, scoped.officeModes, docx)
    scoped.inject(['connection'], routes => registerOfficeRoutes(routes, library, scoped.officeModes))
  })
}
