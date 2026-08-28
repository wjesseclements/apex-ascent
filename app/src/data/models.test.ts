import { MODELS } from './models';

it('models are own-origin bare files with unique ids', () => {
  expect(MODELS.map((m) => m.id)).toEqual(['e7-8m', 'e7-13m', 'e8a-lowdrag-5m']);
  expect(MODELS.map((m) => m.physics)).toEqual(['default', 'default', 'low-drag']);
  for (const m of MODELS) expect(m.file).toMatch(/^\/models\/[a-z0-9-]+\.onnx$/);
});
