// Chamfered phosphor segments, drawn directly in the Shell's Cairo surface.
// No downloaded font or raster asset is needed for the clock face.
const DIGITS = [
    [0, 1, 2, 3, 4, 5], [1, 2], [0, 1, 6, 4, 3],
    [0, 1, 6, 2, 3], [5, 6, 1, 2], [0, 5, 6, 2, 3],
    [0, 5, 6, 4, 2, 3], [0, 1, 2], [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 5, 6],
];

const SEGMENTS = [
    [[9, 2], [47, 2], [52, 7], [47, 12], [9, 12], [4, 7]],
    [[49, 14], [54, 9], [54, 43], [49, 48], [44, 43], [44, 19]],
    [[49, 52], [54, 57], [54, 91], [49, 96], [44, 86], [44, 57]],
    [[9, 88], [47, 88], [52, 93], [47, 98], [9, 98], [4, 93]],
    [[7, 52], [12, 57], [12, 86], [7, 96], [2, 91], [2, 57]],
    [[7, 9], [12, 19], [12, 43], [7, 48], [2, 43], [2, 14]],
    [[10, 45], [46, 45], [51, 50], [46, 55], [10, 55], [5, 50]],
];

export function drawClock(cr, digits, width, height) {
    cr.save();
    cr.scale(width / 272, height / 100);

    [0, 64, 152, 216].forEach((offset, digitIndex) => {
        const active = DIGITS[Number(digits[digitIndex])] ?? [];
        SEGMENTS.forEach((points, segmentIndex) => {
            cr.setSourceRGBA(0.88, 0.89, 0.81, active.includes(segmentIndex) ? 0.96 : 0.045);
            points.forEach(([x, y], index) => {
                if (index === 0) cr.moveTo(offset + x, y);
                else cr.lineTo(offset + x, y);
            });
            cr.closePath();
            cr.fill();
        });
    });

    cr.setSourceRGBA(0.88, 0.89, 0.81, 0.65);
    cr.rectangle(134, 29, 5, 6);
    cr.rectangle(134, 66, 5, 6);
    cr.fill();

    // Fine dark scanlines cross the lit segments themselves.
    cr.setSourceRGBA(0.02, 0.04, 0.03, 0.22);
    for (let y = 0; y < 100; y += 3) cr.rectangle(0, y, 272, 1);
    cr.fill();
    cr.restore();
}
