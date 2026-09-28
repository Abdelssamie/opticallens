# opticallens

3D Optical Lens Simulator

An interactive web-based 3D simulator for visualizing eyeglass lenses from optical prescription values.

The project allows users to modify SPH (Sphere), CYL (Cylinder), and AXIS values and observe their effect on an interactive 3D lens. It also provides an option to display the lens with an eyeglass frame.

Educational project — not intended for medical diagnosis, prescription, or lens manufacturing.

Features
Interactive 3D eyeglass lens visualization
SPH, CYL, and AXIS input
Real-time lens updates
3D rotation, zoom, and pan
Front, side, and perspective views
Optical power visualization
Principal meridian calculation
Spherical equivalent calculation
Approximate lens thickness visualization
Optional eyeglass frame
Adjustable frame and lens parameters
Separate left/right lens visualization
Optical center visualization
Optical Calculation

The optical power at a given meridian is calculated using:

F(θ) = SPH + CYL × sin²(θ − AXIS)

The spherical equivalent is:

SE = SPH + CYL / 2

For example:

SPH  = -2.00 D
CYL  = -3.25 D
AXIS = 125°

The principal powers are approximately:

At AXIS (125°):       -2.00 D
At AXIS + 90° (35°):  -5.25 D
Technologies
HTML5
CSS3
JavaScript
Three.js
WebGL
Project Structure
3D-Optical-Lens-Simulator/
│
├── index.html
├── style.css
└── script.js
index.html

Contains the application structure and user interface.

style.css

Contains the visual styling and layout of the application.

script.js

Contains the optical calculations, 3D lens generation, frame generation, user interaction, and Three.js rendering.

Running the Project

No build system is required.

Simply open:

index.html

in a modern web browser.

If the browser blocks local resources, run a simple local server:

python -m http.server 8000

Then open:

http://localhost:8000
Important Optical Note

SPH, CYL, and AXIS describe the optical power of a prescription. They do not uniquely determine the physical geometry of a manufactured spectacle lens.

The physical shape also depends on parameters such as:

Refractive index
Front/base curve
Back curve
Lens diameter
Center thickness
Edge thickness
Frame dimensions
Manufacturing method

Therefore, the 3D lens shown by this project is an educational approximation, not an exact manufacturing model.

Disclaimer

This project is intended for educational and visualization purposes only.

It should not be used for:

Medical diagnosis
Determining a prescription
Ordering prescription lenses
Manufacturing ophthalmic lenses
Replacing professional optical measurements
