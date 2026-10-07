"""Render the page's formulas from LaTeX into static MathML in site/index.html.

Browsers display MathML natively, so the site needs no math library at runtime. Each formula sits
between markers in index.html:

    <!-- eq:pointing-loss --><!-- /eq -->

and this script replaces whatever is between them with the MathML for FORMULAS["pointing-loss"].
Edit the LaTeX below, then run (latex2mathml is needed only for this step):

    pip install latex2mathml
    python tools/render_formulas.py
"""

import re
import sys
from pathlib import Path

from latex2mathml.converter import convert

INDEX = Path(__file__).resolve().parent.parent / "site" / "index.html"

FORMULAS = {
    # Power converter
    "power-to-watts": r"P_{\text{W}} = 10^{(P_{\text{dBm}} - 30)/10}",
    "power-to-dbm": r"P_{\text{dBm}} = 10 \log_{10} P_{\text{W}} + 30",
    # Doppler
    "doppler-shift": r"\Delta f \approx {-f_0} \frac{v_r}{c}",
    "doppler-received": r"f_r = f_0 + \Delta f",
    # Noise and data rate
    "noise-floor": r"N = {-173.975} + 10 \log_{10} \frac{T_{\text{sys}}}{290\,\text{K}} + 10 \log_{10} B \quad \text{dBm}",
    "noise-tsys": r"T_{\text{sys}} = T_a + 290\,\text{K} \cdot (F - 1), \quad F = 10^{\text{NF}/10}",
    "noise-snr": r"\text{SNR} = C - N",
    "data-cn0": r"C/N_0 = C - \left(-173.975 + 10 \log_{10} \frac{T_{\text{sys}}}{290\,\text{K}}\right) \quad \text{dB-Hz}",
    "data-ebn0": r"E_b/N_0 = C/N_0 - 10 \log_{10} R_b",
    "data-margin": r"M = E_b/N_0 - (E_b/N_0)_{\text{req}} - L_{\text{impl}}, \quad R_{b,\max} = 10^{\left(C/N_0 - (E_b/N_0)_{\text{req}} - L_{\text{impl}}\right)/10}",
    # Polarization mismatch
    "pol-plf": r"\text{PLF} = \frac{1}{2}\left[1 + c_T c_R + e_T e_R \cos 2\psi\right], \quad L = {-10} \log_{10} \text{PLF}",
    "pol-terms": r"e = \frac{r^2 - 1}{r^2 + 1}, \quad c = \frac{2r}{r^2 + 1}, \quad r = \pm 10^{\text{AR}/20}",
    "pol-linear": r"L = {-20} \log_{10} \left|\cos \psi\right|",
    # Pointing
    "pointing-loss": r"L = 12 \left(\frac{\theta_e}{\theta_{3\text{dB}}}\right)^2, \quad L_{\text{total}} = L_{\text{TX}} + L_{\text{RX}}",
    "pointing-dish": r"\theta_{3\text{dB}} \approx 70 \frac{\lambda}{D}, \quad \lambda = \frac{c}{f}",
    # Atmosphere: total and gas (P.676-12)
    "atmo-total": r"A = A_{\text{gas}} + A_{\text{rain}}",
    "gas-specific": r"\gamma_o, \gamma_w = 0.1820\, f\, N''(f) \quad \text{dB/km}",
    "gas-terrestrial": r"A_{\text{gas}} = (\gamma_o + \gamma_w)\, d",
    "gas-slant": r"A_{\text{gas}} = \frac{\gamma_o h_o + \gamma_w h_w}{\sin \theta}, \quad 5° \le \theta \le 90°",
    # Rain specific attenuation (P.838-3)
    "rain-specific": r"\gamma_R = k R^{\alpha} \quad \text{dB/km}",
    "rain-k": r"k = \frac{k_H + k_V + (k_H - k_V) \cos^2 \theta \cos 2\tau}{2}",
    "rain-alpha": r"\alpha = \frac{k_H \alpha_H + k_V \alpha_V + (k_H \alpha_H - k_V \alpha_V) \cos^2 \theta \cos 2\tau}{2k}",
    # Rain, terrestrial (P.530-17)
    "p530-r": r"r = \frac{1}{0.477\, d^{0.633} R^{0.073\alpha} f^{0.123} - 10.579 \left(1 - e^{-0.024 d}\right)}, \quad r \le 2.5",
    "p530-a001": r"A_{0.01} = \gamma_R\, r\, d",
    "p530-ap": r"A_p = A_{0.01}\, C_1\, p^{-(C_2 + C_3 \log_{10} p)}, \quad 0.001\,\% \le p \le 1\,\%",
    "p530-c0": r"C_0 = \begin{cases} 0.12 + 0.4 \left[\log_{10}(f/10)\right]^{0.8} & f \ge 10\ \text{GHz} \\ 0.12 & f < 10\ \text{GHz} \end{cases}",
    "p530-c123": r"C_1 = 0.07^{C_0}\, 0.12^{1 - C_0}, \quad C_2 = 0.855\, C_0 + 0.546\, (1 - C_0), \quad C_3 = 0.139\, C_0 + 0.043\, (1 - C_0)",
    # Rain, Earth-space (P.618-13)
    "p618-ls": r"L_S = \frac{h_R - h_S}{\sin \theta}, \quad L_G = L_S \cos \theta",
    "p618-r": r"r_{0.01} = \frac{1}{1 + 0.78 \sqrt{\frac{L_G \gamma_R}{f}} - 0.38 \left(1 - e^{-2 L_G}\right)}",
    "p618-zeta": r"\zeta = \arctan \frac{h_R - h_S}{L_G\, r_{0.01}}",
    "p618-lr": r"L_R = \begin{cases} \frac{L_G\, r_{0.01}}{\cos \theta} & \zeta > \theta \\ \frac{h_R - h_S}{\sin \theta} & \zeta \le \theta \end{cases}",
    "p618-chi": r"\chi = \begin{cases} 36° - |\varphi| & |\varphi| < 36° \\ 0 & |\varphi| \ge 36° \end{cases}",
    "p618-v": r"v_{0.01} = \frac{1}{1 + \sqrt{\sin \theta} \left(31 \left(1 - e^{-\theta/(1 + \chi)}\right) \frac{\sqrt{L_R \gamma_R}}{f^2} - 0.45\right)}",
    "p618-a001": r"A_{0.01} = \gamma_R\, L_R\, v_{0.01}",
    "p618-ap": r"A_p = A_{0.01} \left(\frac{p}{0.01}\right)^{-\left[0.655 + 0.033 \ln p - 0.045 \ln A_{0.01} - \beta (1 - p) \sin \theta\right]}, \quad 0.001\,\% \le p \le 5\,\%",
    "p618-beta": r"\beta = \begin{cases} 0 & p \ge 1\,\% \text{ or } |\varphi| \ge 36° \\ -0.005 (|\varphi| - 36) & \theta > 25° \\ -0.005 (|\varphi| - 36) + 1.8 - 4.25 \sin \theta & \text{otherwise} \end{cases}",
    # Clouds (P.840)
    "cloud": r"A_{\text{cloud}} = \frac{L\, K_l(f, 0\,°\text{C})}{\sin \theta}",
    "cloud-kl": r"K_l = \frac{0.819\, f}{\varepsilon''\,(1 + \eta^2)}, \quad \eta = \frac{2 + \varepsilon'}{\varepsilon''}",
    # Tropospheric scintillation (P.618-13)
    "scint-sigma": r"\sigma = \frac{\sigma_{\text{ref}}\, f^{7/12}\, g(x)}{(\sin \theta)^{1.2}}, \quad \sigma_{\text{ref}} = 3.6 \times 10^{-3} + 10^{-4} N_{\text{wet}}",
    "scint-x": r"x = 1.22\, (\sqrt{\eta}\, D)^2 \frac{f}{L}, \quad L = \frac{2000\ \text{m}}{\sqrt{\sin^2 \theta + 2.35 \times 10^{-4}} + \sin \theta}",
    "scint-g": r"g(x) = \sqrt{3.86\, (x^2 + 1)^{11/12} \sin\left(\frac{11}{6} \arctan \frac{1}{x}\right) - 7.08\, x^{5/6}}",
    "scint-ap": r"A_s = a(p)\, \sigma, \quad a(p) = -0.061 (\log_{10} p)^3 + 0.072 (\log_{10} p)^2 - 1.71 \log_{10} p + 3",
    # Ionospheric scintillation (P.531)
    "iono-s4": r"S_4(f) = S_4(f_{\text{ref}}) \left(\frac{f}{f_{\text{ref}}}\right)^{-1.5}, \quad P_{\text{fluc}} = 27.5\, S_4^{1.26}",
    "iono-m": r"m = \exp\left(5.69\, e^{-3.055 S_4} + 0.292\, e^{0.344 S_4}\right)",
    "iono-fade": r"\frac{\gamma(m, m I)}{\Gamma(m)} = q, \quad A = {-10} \log_{10} I",
    # Ionospheric absorption (P.531)
    "iono-absorption": r"A = A_{30} \left(\frac{0.03\ \text{GHz}}{f}\right)^2 \sec i, \quad \sin i = \frac{R_e \cos \theta}{R_e + h_D}",
    # Wet radome
    "radome-film": r"h = \left(\frac{3\, \nu\, R\, r}{2\, g}\right)^{1/3}",
    "radome-loss": r"L = {-20} \log_{10} \left|\frac{(1 - \Gamma^2)\, e^{-j\delta}}{1 - \Gamma^2 e^{-2j\delta}}\right|, \quad \Gamma = \frac{1 - n}{1 + n}, \quad \delta = \frac{2\pi f}{c} n h",
    # Vegetation
    "veg-woodland": r"A_{ev} = A_m \left[1 - e^{-d\gamma/A_m}\right]",
    "veg-slant": r"L = 0.25\, f^{0.39}\, d^{0.25}\, \theta^{0.05}",
    # Building entry
    "bel": r"L_{\text{BEL}} = 10 \log_{10}\left(10^{0.1A} + 10^{0.1B} + 10^{0.1C}\right), \quad A = F^{-1}(P)\,\sigma_1 + \mu_1, \quad B = F^{-1}(P)\,\sigma_2 + \mu_2, \quad C = {-3}",
    "bel-terms": r"\mu_1 = r + s \log_{10} f + t \left(\log_{10} f\right)^2 + 0.212\,|\theta|, \quad \mu_2 = w + x \log_{10} f, \quad \sigma_1 = u + v \log_{10} f, \quad \sigma_2 = y + z \log_{10} f",
    # Clutter
    "clutter-terrestrial": r"L_{ctt} = {-5} \log_{10}\left(10^{-0.2 L_l} + 10^{-0.2 L_s}\right) - \sigma_{cb}\, Q^{-1}(p/100)",
    "clutter-terms": r"L_l = {-2} \log_{10}\left(10^{-5 \log_{10} f - 12.5} + 10^{-16.5}\right), \quad L_s = 32.98 + 23.9 \log_{10} d + 3 \log_{10} f",
    "clutter-slant": r"L_{ces} = \left\{-K_1 \ln\left(1 - \frac{p}{100}\right) \cot\left[A_1\left(1 - \frac{\theta}{90}\right) + \frac{\pi\theta}{180}\right]\right\}^{0.5(90 - \theta)/90} - 1 - 0.6\, Q^{-1}(p/100)",
    # Diffraction
    "diff-nu": r"\nu = h \sqrt{\frac{2}{\lambda}\left(\frac{1}{d_1} + \frac{1}{d_2}\right)}, \quad J(\nu) = 6.9 + 20 \log_{10}\left(\sqrt{(\nu - 0.1)^2 + 1} + \nu - 0.1\right)",
    "diff-geometry": r"h = h_o + \frac{d_1 d_2}{2 k R_e} - \left(h_T + (h_R - h_T)\frac{d_1}{d}\right), \quad r_1 = \sqrt{\frac{\lambda\, d_1 d_2}{d_1 + d_2}}",
    # Multipath
    "mp-p0": r"p_0 = K d^{3.51} \left(f^2 + 13\right)^{0.447} 10^{-0.376 \tanh\left(\frac{h_c - 147}{125}\right) - 0.334 |\varepsilon_p|^{0.39} - 0.00027 h_L + 17.85 v_{sr}}",
    "mp-terms": r"|\varepsilon_p| = \frac{|h_r - h_e|}{d}, \quad h_c = \frac{h_r + h_e}{2} - \frac{d^2}{102} - h_t, \quad v_{sr} = \min\left[\left(\frac{dN_{75}}{50}\right)^{1.8} e^{-h_c/(2.5\sqrt{d})},\ \frac{dN_{75}\, d^{1.5} f^{0.5}}{24730}\right]",
    "mp-fade": r"p_w = p_0\, 10^{-A/10} \quad (A \ge A_t = 25 + 1.2 \log_{10} p_0), \quad p_w = Q\, p, \quad Q = 2.85\, p^{-0.13} \le 12",
}

MARKER = re.compile(r"<!-- eq:([\w-]+) -->.*?<!-- /eq -->", re.S)
# A function name such as \sin or \log_{10}, with an optional power, followed by its argument.
FUNCTION = re.compile(r"(\\(?:sin|cos|ln|arctan|log)(?:_\{\d+\}|\^\{?\d\}?)?)\s*(?=[A-Za-z0-9\\|])")


def mathml(latex: str) -> str:
    # MathML adds no space between a function name and its argument (sin θ), so add a thin space.
    latex = FUNCTION.sub(r"\1\\, ", latex)
    # Drop the namespace (implied in HTML) and the per-cell alignment attribute MathML Core ignores.
    out = convert(latex, display="block").replace(' xmlns="http://www.w3.org/1998/Math/MathML"', "")
    return out.replace(' columnalign="left"', "")


def main():
    html = INDEX.read_text(encoding="utf-8")
    used = set()

    def render(m):
        key = m[1]
        if key not in FORMULAS:
            sys.exit(f"index.html refers to an unknown formula: {key}")
        used.add(key)
        return f'<!-- eq:{key} --><div class="eq">{mathml(FORMULAS[key])}</div><!-- /eq -->'

    html = MARKER.sub(render, html)
    unused = sorted(set(FORMULAS) - used)
    if unused:
        sys.exit("Formulas not placed in index.html: " + ", ".join(unused))
    INDEX.write_text(html, encoding="utf-8", newline="\n")
    print(f"Rendered {len(used)} formulas into {INDEX.name}")


if __name__ == "__main__":
    main()
