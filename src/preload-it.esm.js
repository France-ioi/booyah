function preloadOne(url, done) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onprogress = event => {
        if (!event.lengthComputable)
            return false;
        let item = this.getItemByUrl(url);
        item.completion = (event.loaded / event.total) * 100;
        item.downloaded = event.loaded;
        item.total = event.total;
        this.updateProgressBar(item);
    };
    xhr.onload = (event) => {
        let type = event.target.response.type;
        let blob = new Blob([event.target.response], { type: type });
        let blobUrl = URL.createObjectURL(blob);
        let responseURL = event.target.responseURL;
        let item = this.getItemByUrl(url);
        item.blobUrl = blobUrl;
        item.fileName = responseURL.substring(responseURL.lastIndexOf('/') + 1);
        item.type = type;
        item.size = blob.size;
        done(item);
    };
    xhr.send();
}
function updateProgressBar(item) {
    let sumCompletion = 0;
    const maxCompletion = this.status.length * 100;
    for (let itemStatus of this.status) {
        if (itemStatus.completion) {
            sumCompletion += itemStatus.completion;
        }
    }
    const totalCompletion = (sumCompletion / maxCompletion) * 100;
    if (!isNaN(totalCompletion)) {
        this.onprogress({
            progress: totalCompletion,
            item: item
        });
    }
}
function getItemByUrl(rawUrl) {
    for (let item of this.status) {
        if (item.url == rawUrl)
            return item;
    }
}
function fetch(list) {
    return new Promise((resolve, reject) => {
        this.loaded = list.length;
        for (let item of list) {
            this.status.push({ url: item });
            this.preloadOne(item, (item) => {
                this.onfetched(item);
                this.loaded--;
                if (this.loaded == 0) {
                    this.oncomplete(this.status);
                    resolve(this.status);
                }
            });
        }
    });
}
function Preload() {
    return {
        status: [],
        loaded: false,
        onprogress: (e) => { },
        oncomplete: (e) => { },
        onfetched: (e) => { },
        fetch,
        updateProgressBar,
        preloadOne,
        getItemByUrl
    };
}
export default Preload;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC1pdC5lc20uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L3ByZWxvYWQtaXQuZXNtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsVUFBVSxDQUFJLEdBQVUsRUFBRSxJQUFtQjtJQUNyRCxNQUFNLEdBQUcsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO0lBQ2pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMzQixHQUFHLENBQUMsWUFBWSxHQUFHLE1BQU0sQ0FBQztJQUMxQixHQUFHLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQyxFQUFFO1FBQ3hCLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCO1lBQUUsT0FBTyxLQUFLLENBQUE7UUFDekMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBQ3JELElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUMvQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDekIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQztJQUNGLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFTLEVBQUUsRUFBRTtRQUMxQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7UUFDdEMsSUFBSSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENB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