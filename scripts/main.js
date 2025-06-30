// get json data for verses from file
// for some reason the import data thing below does not work for mobile site
// import data from '../assets/verses.json' assert { type: 'json' };

fetch('../assets/verses.json')
    .then(response => response.json())
    .then(data => displayVerses(data))
    .catch((err) => console.log('error: ' + err))

const displayVerses = (data) =>{
        let versesDiv = document.getElementById("verses")

    //  setup the json file of verses into the html
    data.forEach(element => {
        // make all the details and summaries for each item in the json
        let v = document.createElement("details")
        let r = document.createElement("summary")
        // set up a div for each version of the verses
        let esv = document.createElement("div")
        let niv = document.createElement("div")
        let nasb = document.createElement("div")
        // plug in each version of the verse to its respective div
        esv.textContent = element.esv
        niv.textContent = element.niv
        nasb.textContent = element.nasb95
        // put the reference in the summary element
        r.textContent = element.reference
        // put the summary in the details
        v.appendChild(r)
        // put each verse div into the details, and add version classes to each of the respective divs
        v.appendChild(esv).classList.add("esv")
        v.appendChild(niv).classList.add("niv")
        v.appendChild(nasb).classList.add("nasb")
        // initialize with niv and nasb hidden
        niv.setAttribute("hidden", true)
        nasb.setAttribute("hidden", true)
        // put each details element into the versesDiv div
        versesDiv.appendChild(v)
    });

    const summaries = document.querySelectorAll('summary');
    const esv = document.querySelectorAll(".esv")
    const niv = document.querySelectorAll(".niv")
    const nasb = document.querySelectorAll(".nasb")
    const esvBtn = document.querySelector("#esv")
    const nivBtn = document.querySelector("#niv")
    const nasbBtn = document.querySelector("#nasb")

    function showVersion(version) {
        const versions = {
            esv: { btn: esvBtn, elements: esv },
            niv: { btn: nivBtn, elements: niv },
            nasb: { btn: nasbBtn, elements: nasb }
        };

        // Loop through all versions to set the correct visibility and active class
        for (const key in versions) {
            const isSelected = key === version;
            versions[key].elements.forEach(e => {
                if (isSelected) {
                    e.removeAttribute("hidden");
                } else {
                    e.setAttribute("hidden", true);
                }
            });
            versions[key].btn.classList.toggle("active", isSelected);
        }
    }

    // add eventListener to all the summaries
    summaries.forEach(summary => {
        summary.addEventListener('click', closeOpenedDetails);
    });

    // add event listeners to the three buttons to change versions
    esvBtn.addEventListener('click', () => showVersion('esv'))
    nivBtn.addEventListener('click', () => showVersion('niv'))
    nasbBtn.addEventListener('click', () => showVersion('nasb'))

    // only allow one details panel to be open at one time
    function closeOpenedDetails(){
        summaries.forEach(summary => {
            let detail = summary.parentNode;
            if(detail != this.parentNode){
                detail.removeAttribute('open')
            }
        });
    }
}











