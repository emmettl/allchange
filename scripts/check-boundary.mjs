import { checkEditionBoundary } from '@motionstudies/data/edition-boundary'

await checkEditionBoundary({ directories: ['src', 'scripts', 'london-worker', 'london-road-worker'] })
console.log('allchange uses pinned npm releases and declared public imports.')
