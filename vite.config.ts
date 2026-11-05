import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import yaml from '@modyfi/vite-plugin-yaml';
import svgr from 'vite-plugin-svgr';

/** Read theme_preset from config.yml without pulling in a YAML runtime. */
function readThemePreset(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'config.yml'), 'utf8');
    const m = raw.match(/^\s*theme_preset:\s*['"]?([^\s#'"]+)/m);
    return m?.[1] ?? 'dashboard';
  } catch {
    return 'dashboard';
  }
}

/**
 * Inject dashboard_pro first-paint shell into index.html at build/dev time.
 * Other presets keep an empty #root (no pro layout flash).
 */
function injectProBootShell(): Plugin {
  const preset = readThemePreset();
  const enabled = preset === 'dashboard_pro';
  return {
    name: 'inject-pro-boot-shell',
    transformIndexHtml(html) {
      if (!enabled) {
        return html
          .replace('<!--boot-shell-pro-style-->', '')
          .replace('<!--boot-shell-pro-->', '');
      }
      const css = fs.readFileSync(
        path.resolve(__dirname, 'src/components/boot-shell-pro.css'),
        'utf8'
      );
      const shell = fs.readFileSync(
        path.resolve(__dirname, 'src/components/boot-shell-pro.html'),
        'utf8'
      );
      return html
        .replace(
          '<!--boot-shell-pro-style-->',
          `<style id="boot-shell-pro-css">
${css}
</style>`
        )
        .replace('<!--boot-shell-pro-->', shell.trim());
    },
  };
}

const colorClassMapping: { [key: string]: string } = {
  '#1a1a1a': 'svg-color-bg',
  '#222': 'svg-color-bg',
  '#222222': 'svg-color-bg',
  '#444': 'svg-color-inactive-cell',
  '#444444': 'svg-color-inactive-cell',
  '#4dd2ff': 'svg-color-active-cell',
  '#fff': 'svg-color-text',
  '#ffffff': 'svg-color-text',
  '#e1ed5e': 'svg-color-text',
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    injectProBootShell(),
    react(),
    tailwindcss(),
    yaml(),
    svgr({
      include: ['**/*.svg'],
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
        plugins: ['@svgr/plugin-svgo', '@svgr/plugin-jsx'],
        svgoConfig: {
          floatPrecision: 2,
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeTitle: false,
                  removeViewBox: false,
                },
              },
            },
            {
              name: 'addClassesByFillColor',
              fn: () => {
                return {
                  element: {
                    enter: (node: {
                      attributes: {
                        fill?: string;
                        stroke?: string;
                        class?: string;
                      };
                    }) => {
                      const fillColor = node.attributes.fill;
                      if (fillColor) {
                        const lowerCaseFill = fillColor.toLowerCase();
                        if (colorClassMapping[lowerCaseFill]) {
                          node.attributes.class =
                            colorClassMapping[lowerCaseFill];
                        }
                      }
                      const strokeColor = node.attributes.stroke;
                      if (strokeColor) {
                        const lowerCaseStroke = strokeColor.toLowerCase();
                        if (colorClassMapping[lowerCaseStroke]) {
                          const existingClass = node.attributes.class || '';
                          const newClass = colorClassMapping[lowerCaseStroke];
                          if (!existingClass.includes(newClass)) {
                            node.attributes.class =
                              `${existingClass} ${newClass}`.trim();
                          }
                        }
                      }
                    },
                  },
                };
              },
            },
          ],
        },
      },
    }),
  ],
  // PATH_PREFIX=/ must not become base '//' (protocol-relative → broken assets / white screen)
  base: (() => {
    const prefix = process.env.PATH_PREFIX;
    if (!prefix || prefix === '/') return '/';
    return prefix.endsWith('/') ? prefix : `${prefix}/`;
  })(),
  define: {
    'import.meta.env.VERCEL': JSON.stringify(process.env.VERCEL),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, 'config.yml'),
      '@core': path.resolve(__dirname, './src/core'),
      '@themes': path.resolve(__dirname, './src/themes'),
      '@assets': path.resolve(__dirname, './assets'),
    },
  },
  build: {
    manifest: true,
    modulePreload: false,
    outDir: './dist',
  },
});
