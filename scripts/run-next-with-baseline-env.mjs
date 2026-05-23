process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= 'true';
process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= 'true';

await import('next/dist/bin/next');
