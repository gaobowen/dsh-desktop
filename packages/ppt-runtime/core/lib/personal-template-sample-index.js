export const PERSONAL_TEMPLATE_SAMPLE_VERSION = 1;

export function validPersonalTemplateSamples(samples, count) {
  return samples?.version === PERSONAL_TEMPLATE_SAMPLE_VERSION && Number.isInteger(samples.simplifiedTextCount) && samples.simplifiedTextCount >= 0
    && Array.isArray(samples.layouts) && samples.layouts.length === count
    && samples.layouts.every((page, i) => page?.slideNumber === i + 1 && ['cover', 'agenda', 'section', 'closing', 'content', 'multi-block', 'visual', 'data'].includes(page.role)
      && ['sample', 'source'].includes(page.content) && typeof page.representative === 'boolean')
    && Array.isArray(samples.representativePages) && samples.representativePages.length > 0
    && JSON.stringify(samples.representativePages) === JSON.stringify(samples.layouts.filter(page => page.representative).map(page => page.slideNumber));
}
