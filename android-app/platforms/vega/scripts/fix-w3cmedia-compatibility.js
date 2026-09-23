const fs = require('fs');
const path = require('path');

const packageRoot = path.dirname(
  require.resolve('@amazon-devices/react-native-w3cmedia/package.json'),
);
const packageJson = require(path.join(packageRoot, 'package.json'));
const compatibilityPath = path.join(packageRoot, 'kepler-compatibility.json');
const sliderMetadataPath = path.join(
  packageRoot,
  'dist/components/mediacontrols/SliderMetaData.js',
);
const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, 'utf8'));
const publishedVersion = packageJson.version;
const baseVersion = publishedVersion.replace(/-rn-\d+$/, '');

if (!compatibility.versions[publishedVersion] && compatibility.versions[baseVersion]) {
  compatibility.versions[publishedVersion] = compatibility.versions[baseVersion];
  fs.writeFileSync(
    compatibilityPath,
    `${JSON.stringify(compatibility, null, 2)}\n`,
  );
}

const sliderMetadata = fs.readFileSync(sliderMetadataPath, 'utf8');
const compatibleSliderMetadata = sliderMetadata.replace(
  'forwardRef)((props) => {',
  'forwardRef)((props, _ref) => {',
);
if (compatibleSliderMetadata !== sliderMetadata) {
  fs.writeFileSync(sliderMetadataPath, compatibleSliderMetadata);
}
