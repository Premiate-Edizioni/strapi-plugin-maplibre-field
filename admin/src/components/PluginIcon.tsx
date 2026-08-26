import { Flex } from '@strapi/design-system';
import { styled } from 'styled-components';

/* The pin and the bar below it are left unfilled on purpose: IconBox paints them.

   The artwork's own bounding box is 182x290 starting at the origin; the viewBox is a square
   386 wide with that box centred inside it, so the drawing covers 75% of the canvas and the
   rest is margin. That follows @strapi/icons, where 165 icons share viewBox "0 0 32 32", the
   median glyph measures 24x23, and only 5 touch an edge — the margin lives in the viewBox,
   not in padding on the container, so the icon insets itself at any size. Strapi documents
   `icon` only as a React component, and its own ColorPickerIcon just renders one of these,
   so the set is the only convention there is to follow. */
const MapLibreIcon = () => (
  <svg width="16" height="16" viewBox="-102 -48 386 386" focusable="false">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M 91.32,0.578 C 41.994,0.258 1.624,37.59 1.323,83.793 c -0.266,40.912 19.964,60.885 41.871,82.513 15.273,15.078 31.36,30.96 41.885,55.302 0.71,0.577 1.185,0.962 1.389,1.144 a 5.164,5.164 0 0 0 3.398,1.286 5.172,5.172 0 0 0 3.416,-1.241 c 0.055,-0.049 0.156,-0.092 0.28,-0.145 0.34,-0.146 0.857,-0.368 1.124,-0.983 10.49,-24.11 26.806,-39.778 42.388,-54.74 22.189,-21.307 42.888,-41.184 43.153,-81.972 C 180.528,38.753 140.647,0.9 91.32,0.578 Z m -0.86,132.349 c 24.424,0.159 44.356,-19.81 44.517,-44.602 0.161,-24.792 -19.509,-45.019 -43.934,-45.178 -24.425,-0.159 -44.356,19.81 -44.518,44.602 -0.161,24.792 19.509,45.019 43.934,45.178 z"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="m 58.49,238.338 c -4.075,-0.027 -7.408,4.48 -7.444,10.065 l -0.184,28.269 c -0.037,5.585 3.237,10.134 7.313,10.161 l 62.385,0.406 c 4.075,0.026 7.408,-4.48 7.444,-10.065 l 0.184,-28.269 c 0.037,-5.586 -3.237,-10.135 -7.313,-10.161 z"
    />
  </svg>
);

const IconBox = styled(Flex)`
  /* Hard code color values */
  /* to stay consistent between themes */
  background-color: #f0f0ff; /* primary100 */
  border: 1px solid #d9d8ff; /* primary200 */

  svg > path {
    fill: #4945ff; /* primary600 */
  }
`;

/* Two boxes, and both are needed.

   The inner one is the tile you see: 32x24 (spacing scale 7 and 6), the shape Strapi's own
   ColorPickerIcon uses and therefore the shape a custom field is expected to have — it sits
   beside that very tile in the field picker.

   The outer one exists only to fill the 3.2rem square AttributeIcon reserves. That square is
   centred against the field name next to it, and a 24px tile left alone inside it lands at
   the top, 4px above the name. Strapi stretches a built-in field's icon to fill the square
   with `svg { height: 100%; width: 100% }`, but that rule cannot reach through the <div> a
   custom field renders, so the centring has to happen here. */
const PluginIcon = () => {
  return (
    <Flex justifyContent="center" alignItems="center" width={7} height={7} aria-hidden>
      <IconBox justifyContent="center" alignItems="center" width={7} height={6} hasRadius>
        <MapLibreIcon />
      </IconBox>
    </Flex>
  );
};

export default PluginIcon;
