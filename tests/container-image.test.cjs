const { readFileSync } = require('fs');
const { resolve } = require('path');
const { load } = require('js-yaml');

const ROOT = resolve(__dirname, '..');
const DEVCONTAINER_PATH = resolve(ROOT, '.devcontainer/devcontainer.json');
const GCI_WORKFLOW_PATH = resolve(ROOT, '.github/workflows/gci.yaml');

describe('container image consistency', () => {
  it('devcontainer.json and gci.yaml use the same container image', () => {
    const devcontainer = JSON.parse(readFileSync(DEVCONTAINER_PATH, 'utf-8'));
    const gciWorkflow = load(readFileSync(GCI_WORKFLOW_PATH, 'utf-8'));

    const devcontainerImage = devcontainer.image;
    const gciImage = gciWorkflow.jobs['gci-linux'].container.image;

    expect(devcontainerImage).toBeDefined();
    expect(gciImage).toBeDefined();
    expect(devcontainerImage).toBe(gciImage);
  });
});
